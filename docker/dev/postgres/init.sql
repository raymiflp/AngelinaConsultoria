-- =============================================================================
-- Init script: angelina-consultoria PostgreSQL
-- =============================================================================
-- Este script se ejecuta en la primera inicialización del contenedor.

-- Crear schemas por capa de Clean Architecture
CREATE SCHEMA IF NOT EXISTS domain;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS compliance;

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- Cifrado de datos clínicos
CREATE EXTENSION IF NOT EXISTS pg_stat_statements; -- Monitoreo de queries

-- Configuración de zona horaria
ALTER DATABASE angelina_consultoria SET timezone TO 'Europe/Madrid';
