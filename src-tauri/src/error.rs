use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(sqlx::Error),

    #[error("Keychain error: {0}")]
    Keychain(String),

    #[error("Connection not found: {0}")]
    ConnectionNotFound(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Export error: {0}")]
    Export(String),
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::Database(err)
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}

#[derive(Serialize)]
pub struct SerializableError {
    pub message: String,
    pub technical: Option<String>,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let ser = match self {
            AppError::Database(err) => {
                let technical = Some(format!("{:?}", err));
                let msg = match err {
                    sqlx::Error::Database(db_err) => db_err.message().to_string(),
                    _ => err.to_string(),
                };
                SerializableError {
                    message: format!("Database Error: {}", msg),
                    technical,
                }
            }
            AppError::Keychain(err) => SerializableError {
                message: "Secure Storage Error".to_string(),
                technical: Some(err.clone()),
            },
            AppError::ConnectionNotFound(err) => SerializableError {
                message: "Connection Not Found".to_string(),
                technical: Some(err.clone()),
            },
            AppError::Validation(err) => SerializableError {
                message: "Validation Failed".to_string(),
                technical: Some(err.clone()),
            },
            AppError::Io(err) => SerializableError {
                message: "File System Error".to_string(),
                technical: Some(err.clone()),
            },
            AppError::Export(err) => SerializableError {
                message: "Export Failed".to_string(),
                technical: Some(err.clone()),
            },
        };
        ser.serialize(serializer)
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
