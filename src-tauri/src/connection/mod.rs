use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use sqlx::postgres::{PgPool, PgPoolOptions};
use crate::error::{AppError, Result};

#[derive(serde::Deserialize, Clone)]
pub struct ConnectionConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: Option<String>,
    pub database: String,
    pub ssl_mode: Option<String>,
}

impl ConnectionConfig {
    pub fn to_connection_string(&self) -> String {
        let password_part = match &self.password {
            Some(pw) if !pw.is_empty() => format!(":{}", urlencoding::encode(pw)),
            _ => String::new(),
        };
        let ssl_part = match &self.ssl_mode {
            Some(mode) if !mode.is_empty() && mode != "Auto" && mode != "auto" => {
                format!("?sslmode={}", mode.to_lowercase())
            }
            _ => String::new(),
        };
        format!(
            "postgresql://{}{}@{}:{}/{}{}",
            urlencoding::encode(&self.user),
            password_part,
            self.host,
            self.port,
            self.database,
            ssl_part
        )
    }
}

pub struct ConnectionManager {
    pools: Arc<RwLock<HashMap<String, PgPool>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            pools: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn connect(&self, id: &str, url: &str) -> Result<()> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(url)
            .await
            .map_err(|e| AppError::Database(e))?;

        let mut pools = self.pools.write().await;
        pools.insert(id.to_string(), pool);
        Ok(())
    }

    pub async fn disconnect(&self, id: &str) -> Result<()> {
        let mut pools = self.pools.write().await;
        if let Some(pool) = pools.remove(id) {
            pool.close().await;
        }
        Ok(())
    }

    pub async fn get_pool(&self, id: &str) -> Result<PgPool> {
        let pools = self.pools.read().await;
        pools.get(id)
            .cloned()
            .ok_or_else(|| AppError::ConnectionNotFound(id.to_string()))
    }

    pub async fn test_connection(url: &str) -> Result<()> {
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(5))
            .connect(url)
            .await
            .map_err(|e| AppError::Database(e))?;

        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| AppError::Database(e))?;

        pool.close().await;
        Ok(())
    }
}
