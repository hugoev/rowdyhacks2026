#![allow(unexpected_cfgs)]
use solana_program::{account_info::{next_account_info, AccountInfo}, clock::Clock,
    entrypoint, entrypoint::ProgramResult, program::invoke_signed, program_error::ProgramError,
    pubkey::Pubkey, rent::Rent, system_instruction, system_program, sysvar::Sysvar};

#[cfg(not(feature = "no-entrypoint"))]
entrypoint!(process_instruction);
pub const SIZE: usize = 147;
pub const DAY: i64 = 86_400;
fn key(bytes: &[u8]) -> Pubkey { Pubkey::new_from_array(bytes.try_into().unwrap()) }
fn number(bytes: &[u8]) -> u64 { u64::from_le_bytes(bytes.try_into().unwrap()) }

// Wire layout: version, status(0 held/1 released/2 refunded), depositor,
// guardian, recipient, unlock timestamp, amount, payment hash, PDA bump.
// No account is closed: terminal state prevents replay and supports reconciliation.
pub fn process_instruction(program: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let iter = &mut accounts.iter();
    match data.first() {
        Some(0) if data.len() == 113 => {
            let payer = next_account_info(iter)?;
            let vault = next_account_info(iter)?;
            let system = next_account_info(iter)?;
            if !payer.is_signer || !payer.is_writable || !vault.is_writable { return Err(ProgramError::MissingRequiredSignature); }
            if system.key != &system_program::ID || vault.owner != &system_program::ID || !vault.data_is_empty() { return Err(ProgramError::InvalidAccountData); }
            let hash = &data[1..33]; let amount = number(&data[33..41]);
            let unlock = i64::from_le_bytes(data[41..49].try_into().unwrap());
            let now = Clock::get()?.unix_timestamp;
            let guardian = key(&data[49..81]); let recipient = key(&data[81..113]);
            if amount == 0 || amount > 10_000_000 || unlock < now + DAY || unlock > now + DAY + 120 || guardian == *payer.key || guardian == Pubkey::default() || recipient == *vault.key || recipient == *payer.key { return Err(ProgramError::InvalidInstructionData); }
            let (address, bump) = Pubkey::find_program_address(&[b"tripwire", payer.key.as_ref(), hash], program);
            if vault.key != &address { return Err(ProgramError::InvalidSeeds); }
            let rent = Rent::get()?.minimum_balance(SIZE);
            let required = rent.checked_add(amount).ok_or(ProgramError::ArithmeticOverflow)?;
            let seeds: &[&[u8]] = &[b"tripwire", payer.key.as_ref(), hash, &[bump]];
            if vault.lamports() == 0 {
                invoke_signed(&system_instruction::create_account(payer.key, vault.key, required, SIZE as u64, program),
                    &[payer.clone(), vault.clone(), system.clone()], &[seeds])?;
            } else {
                // A third party may pre-fund a public PDA. Allocate/assign it rather
                // than allowing that transfer to permanently block the deposit.
                invoke_signed(&system_instruction::allocate(vault.key, SIZE as u64), &[vault.clone(), system.clone()], &[seeds])?;
                invoke_signed(&system_instruction::assign(vault.key, program), &[vault.clone(), system.clone()], &[seeds])?;
                let needed = required.saturating_sub(vault.lamports());
                if needed > 0 { invoke_signed(&system_instruction::transfer(payer.key, vault.key, needed), &[payer.clone(), vault.clone(), system.clone()], &[])?; }
            }
            let mut state = vault.try_borrow_mut_data()?;
            state[0] = 1; state[1] = 0;
            state[2..34].copy_from_slice(payer.key.as_ref()); state[34..66].copy_from_slice(guardian.as_ref()); state[66..98].copy_from_slice(recipient.as_ref());
            state[98..106].copy_from_slice(&unlock.to_le_bytes()); state[106..114].copy_from_slice(&amount.to_le_bytes()); state[114..146].copy_from_slice(hash); state[146] = bump;
            Ok(())
        }
        Some(1) if data.len() == 2 && data[1] <= 1 => {
            let actor = next_account_info(iter)?; let vault = next_account_info(iter)?; let destination = next_account_info(iter)?;
            if vault.owner != program || !vault.is_writable || !destination.is_writable || !actor.is_signer || destination.key == vault.key { return Err(ProgramError::InvalidAccountData); }
            let mut state = vault.try_borrow_mut_data()?;
            if state.len() != SIZE || state[0] != 1 || state[1] != 0 { return Err(ProgramError::InvalidAccountData); }
            let depositor = key(&state[2..34]); let guardian = key(&state[34..66]); let recipient = key(&state[66..98]);
            let unlock = i64::from_le_bytes(state[98..106].try_into().unwrap()); let amount = number(&state[106..114]);
            let expected = Pubkey::create_program_address(&[b"tripwire", depositor.as_ref(), &state[114..146], &[state[146]]], program)?;
            if vault.key != &expected { return Err(ProgramError::InvalidSeeds); }
            let refund = data[1] == 1;
            authorize(actor.key == &guardian, refund, Clock::get()?.unix_timestamp, unlock)?;
            if destination.key != if refund { &depositor } else { &recipient } { return Err(ProgramError::InvalidAccountData); }
            let remaining = vault.lamports().checked_sub(amount).ok_or(ProgramError::InsufficientFunds)?;
            let received = destination.lamports().checked_add(amount).ok_or(ProgramError::ArithmeticOverflow)?;
            **vault.try_borrow_mut_lamports()? = remaining; **destination.try_borrow_mut_lamports()? = received;
            state[1] = if refund { 2 } else { 1 }; Ok(())
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
fn authorize(guardian: bool, refund: bool, now: i64, unlock: i64) -> ProgramResult {
    if !guardian && (refund || now < unlock) { Err(ProgramError::MissingRequiredSignature) } else { Ok(()) }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn second_key_or_deadline_required() {
        assert!(authorize(false, false, 99, 100).is_err());
        assert!(authorize(true, false, 99, 100).is_ok());
        assert!(authorize(false, false, 100, 100).is_ok());
        assert!(authorize(false, true, 101, 100).is_err());
        assert!(authorize(true, true, 99, 100).is_ok());
    }
}
