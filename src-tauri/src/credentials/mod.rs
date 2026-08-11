use crate::error::{AppError, Result};
use keyring::Entry;

const SERVICE_NAME: &str = "com.postgresd.credentials";

pub fn set_password(connection_id: &str, password: &str) -> Result<()> {
    let entry = Entry::new(SERVICE_NAME, connection_id)
        .map_err(|e| AppError::Keychain(e.to_string()))?;
    entry.set_password(password)
        .map_err(|e| AppError::Keychain(e.to_string()))?;
    Ok(())
}

pub fn get_password(connection_id: &str) -> Result<String> {
    let entry = Entry::new(SERVICE_NAME, connection_id)
        .map_err(|e| AppError::Keychain(e.to_string()))?;
    match entry.get_password() {
        Ok(pw) => Ok(pw),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(AppError::Keychain(e.to_string())),
    }
}

pub fn delete_password(connection_id: &str) -> Result<()> {
    let entry = Entry::new(SERVICE_NAME, connection_id)
        .map_err(|e| AppError::Keychain(e.to_string()))?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Keychain(e.to_string())),
    }
}
