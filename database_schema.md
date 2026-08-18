# Database Schema - Sistema de Gestion de Panaderia

> **Motor de datos original:** Firebase Firestore (NoSQL)
> **Esquema de referencia:** SQL Server (T-SQL)
> **Fecha de generacion:** 2026-08-17

---

## Indice

1. [Diagrama de Relaciones](#1-diagrama-de-relaciones)
2. [Tabla: empleados](#2-tabla-empleados)
3. [Tabla: clientes](#3-tabla-clientes)
4. [Tabla: inventario](#4-tabla-inventario)
5. [Tabla: adelantos](#5-tabla-adelantos)
6. [Tabla: pagos_personal](#6-tabla-pagos_personal)
7. [Tabla: ventas](#7-tabla-ventas)
8. [Tabla: gastos_inventario](#8-tabla-gastos_inventario)
9. [Script DDL Completo](#9-script-ddl-completo)
10. [Scripts de Insercion (Datos de Prueba)](#10-scripts-de-insercion-datos-de-prueba)
11. [Vistas y Consultas Frecuentes](#11-vistas-y-consultas-frecuentes)
12. [Reglas de Validacion](#12-reglas-de-validacion)

---

## 1. Diagrama de Relaciones

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│  empleados   │       │   pagos_personal  │       │   inventario │
│──────────────│       │──────────────────│       │──────────────│
│ PK id        │──1:N──│ PK id            │       │ PK id        │
│    nombre    │       │ FK empleado_id   │       │    nombre    │
│    telefono  │       │    monto         │       │    nombreNorm│
│    estado    │       │    concepto      │       │ fechaRegistro│
│ fechaIngreso │       │    dia           │       └──────┬───────┘
└──────┬───────┘       │    fecha_registro│              │
       │               │    creado_por    │              │
       │               └──────────────────┘              │
       │                                                 │
       │       ┌──────────────────┐              ┌───────┴────────┐
       │       │    adelantos     │              │gastos_invent.  │
       │       │──────────────────│              │────────────────│
       └──1:N──│ PK id            │              │ PK id          │
               │ FK empleado_id   │              │ FK inventario_id│
               │    monto         │              │    producto    │
               │    concepto      │              │    productoNorm│
               │    dia           │              │    monto       │
               │    fecha_registro│              │    fecha_registro│
               │    creado_por    │              └────────────────┘
               └──────────────────┘

┌──────────────┐       ┌──────────────────┐
│   clientes   │       │     ventas       │
│──────────────│       │──────────────────│
│ PK id        │──1:N──│ PK id            │
│    nombre    │       │ FK cliente_id    │
│    nombreNorm│       │    cantidadFundas│
│    telefono  │       │    totalVenta    │
│ fechaRegistro│       │    estadoPago    │
│    creado_por│       │    montoAbono    │
└──────────────┘       │    fecha_venta   │
                       │    fecha_registro│
                       │    creado_por    │
                       └──────────────────┘
```

---

## 2. Tabla: empleados

> **Coleccion Firestore original:** Ninguna (nombres hardcodeados en `TRABAJADORES`)
> **Motivo de creacion:** En Firestore los empleados estan como array constante en el codigo.
> En SQL se normaliza a tabla para permitir relaciones FK y escalabilidad.

| # | Campo | Tipo SQL | Nulo | Default | Descripcion |
|---|-------|----------|------|---------|-------------|
| 1 | `id` | `INT IDENTITY(1,1)` | NO | auto | Llave primaria autoincremental |
| 2 | `nombre` | `VARCHAR(50)` | NO | — | Nombre completo del empleado |
| 3 | `telefono` | `VARCHAR(20)` | SI | NULL | Telefono de contacto |
| 4 | `estado` | `VARCHAR(10)` | NO | `'activo'` | Estado: `activo` o `inactivo` |
| 5 | `fecha_registro` | `DATETIME` | NO | `GETDATE()` | Fecha de alta en el sistema |

**Restricciones:**
- PK: `id`
- UNIQUE: `nombre`
- CHECK: `estado IN ('activo', 'inactivo')`

---

## 3. Tabla: clientes

> **Coleccion Firestore original:** `clientes`

| # | Campo | Tipo SQL | Nulo | Default | Descripcion |
|---|-------|----------|------|---------|-------------|
| 1 | `id` | `INT IDENTITY(1,1)` | NO | auto | Llave primaria autoincremental |
| 2 | `nombre` | `VARCHAR(80)` | NO | — | Nombre del cliente |
| 3 | `nombre_norm` | `VARCHAR(80)` | NO | — | Nombre normalizado (minusculas, sin tildes) para busqueda |
| 4 | `telefono` | `VARCHAR(20)` | SI | NULL | Telefono (solo digits y `+`) |
| 5 | `fecha_registro` | `DATETIME` | NO | `GETDATE()` | Fecha de creacion del registro |
| 6 | `creado_por` | `VARCHAR(100)` | SI | NULL | Email o UID del usuario que creo el registro |

**Restricciones:**
- PK: `id`
- UNIQUE: `nombre_norm`
- INDEX: `idx_clientes_nombre_norm` en `nombre_norm`

---

## 4. Tabla: inventario

> **Coleccion Firestore original:** `inventario`

| # | Campo | Tipo SQL | Nulo | Default | Descripcion |
|---|-------|----------|------|---------|-------------|
| 1 | `id` | `INT IDENTITY(1,1)` | NO | auto | Llave primaria autoincremental |
| 2 | `nombre` | `VARCHAR(80)` | NO | — | Nombre del producto/insumo |
| 3 | `nombre_norm` | `VARCHAR(80)` | NO | — | Nombre normalizado para deduplicacion |
| 4 | `fecha_registro` | `DATETIME` | NO | `GETDATE()` | Fecha de alta del producto |

**Restricciones:**
- PK: `id`
- UNIQUE: `nombre_norm`

---

## 5. Tabla: adelantos

> **Coleccion Firestore original:** `adelantos`

| # | Campo | Tipo SQL | Nulo | Default | Descripcion |
|---|-------|----------|------|---------|-------------|
| 1 | `id` | `INT IDENTITY(1,1)` | NO | auto | Llave primaria autoincremental |
| 2 | `empleado_id` | `INT` | NO | — | FK hacia `empleados.id` |
| 3 | `monto` | `DECIMAL(10,2)` | NO | — | Monto del adelanto (0.01 - 1,000,000.00) |
| 4 | `concepto` | `VARCHAR(120)` | SI | `'Adelanto'` | Descripcion del motivo |
| 5 | `dia` | `VARCHAR(10)` | NO | — | Fecha del negocio en formato `YYYY-MM-DD` |
| 6 | `fecha_registro` | `DATETIME` | NO | `GETDATE()` | Timestamp server de Firestore |
| 7 | `creado_por` | `VARCHAR(100)` | SI | NULL | Email o UID del usuario creador |

**Restricciones:**
- PK: `id`
- FK: `empleado_id` REFERENCES `empleados(id)`
- CHECK: `monto >= 0.01 AND monto <= 1000000`
- CHECK: `dia LIKE '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`
- INDEX: `idx_adelantos_empleado` en `empleado_id`
- INDEX: `idx_adelantos_dia` en `dia`

---

## 6. Tabla: pagos_personal

> **Coleccion Firestore original:** `pagos_personal`

| # | Campo | Tipo SQL | Nulo | Default | Descripcion |
|---|-------|----------|------|---------|-------------|
| 1 | `id` | `INT IDENTITY(1,1)` | NO | auto | Llave primaria autoincremental |
| 2 | `empleado_id` | `INT` | NO | — | FK hacia `empleados.id` |
| 3 | `monto` | `DECIMAL(10,2)` | NO | — | Monto del pago de jornal (0.01 - 1,000,000.00) |
| 4 | `concepto` | `VARCHAR(120)` | SI | `'Pago de jornal'` | Descripcion del pago |
| 5 | `dia` | `VARCHAR(10)` | NO | — | Fecha del negocio en formato `YYYY-MM-DD` |
| 6 | `fecha_registro` | `DATETIME` | NO | `GETDATE()` | Timestamp server de Firestore |
| 7 | `creado_por` | `VARCHAR(100)` | SI | NULL | Email o UID del usuario creador |

**Restricciones:**
- PK: `id`
- FK: `empleado_id` REFERENCES `empleados(id)`
- CHECK: `monto >= 0.01 AND monto <= 1000000`
- CHECK: `dia LIKE '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`
- INDEX: `idx_pagos_empleado` en `empleado_id`
- INDEX: `idx_pagos_dia` en `dia`

---

## 7. Tabla: ventas

> **Coleccion Firestore original:** `ventas`
> **Indice compuesto Firestore:** `estadoPago ASC` + `fecha ASC`

| # | Campo | Tipo SQL | Nulo | Default | Descripcion |
|---|-------|----------|------|---------|-------------|
| 1 | `id` | `INT IDENTITY(1,1)` | NO | auto | Llave primaria autoincremental |
| 2 | `cliente_id` | `INT` | SI | NULL | FK hacia `clientes.id` (NULL = Cliente General) |
| 3 | `cliente_nombre` | `VARCHAR(80)` | NO | `'Cliente General'` | Nombre del cliente (denormalizado para consultas rapidas) |
| 4 | `cantidad_fundas` | `INT` | NO | — | Cantidad de fundas vendidas (1 - 999, 0 para abonos) |
| 5 | `total_venta` | `DECIMAL(10,2)` | NO | — | Monto total de la venta (> 0, <= 1,000,000) |
| 6 | `estado_pago` | `VARCHAR(10)` | NO | `'pagado'` | Estado: `pagado`, `debe`, `abono` |
| 7 | `monto_abono` | `DECIMAL(10,2)` | SI | NULL | Monto abonado (solo cuando `estado_pago = 'abono'`) |
| 8 | `fecha_venta` | `DATETIME` | NO | — | Fecha/hora de la venta (seleccionada por el usuario o `new Date()`) |
| 9 | `fecha_registro` | `DATETIME` | NO | `GETDATE()` | Timestamp server de Firestore |
| 10 | `creado_por` | `VARCHAR(100)` | SI | NULL | Email o UID del usuario creador |

**Restricciones:**
- PK: `id`
- FK: `cliente_id` REFERENCES `clientes(id)` ON DELETE SET NULL
- CHECK: `estado_pago IN ('pagado', 'debe', 'abono')`
- CHECK: `cantidad_fundas >= 0 AND cantidad_fundas <= 999`
- CHECK: `total_venta > 0 AND total_venta <= 1000000`
- CHECK: `monto_abono IS NULL OR (monto_abono >= 0.01 AND monto_abono <= 1000000)`
- INDEX: `idx_ventas_estado_fecha` en `estado_pago, fecha_venta`
- INDEX: `idx_ventas_fecha` en `fecha_venta`
- INDEX: `idx_ventas_cliente` en `cliente_id`

---

## 8. Tabla: gastos_inventario

> **Coleccion Firestore original:** `gastos_inventario`
> **Nota legacy:** Documentos antiguos pueden tener campo `descripcion` en vez de `producto`.

| # | Campo | Tipo SQL | Nulo | Default | Descripcion |
|---|-------|----------|------|---------|-------------|
| 1 | `id` | `INT IDENTITY(1,1)` | NO | auto | Llave primaria autoincremental |
| 2 | `inventario_id` | `INT` | SI | NULL | FK hacia `inventario.id` (NULL si es gasto legacy) |
| 3 | `producto` | `VARCHAR(80)` | NO | — | Nombre del producto/insumo (denormalizado) |
| 4 | `producto_norm` | `VARCHAR(80)` | NO | — | Nombre normalizado |
| 5 | `monto` | `DECIMAL(10,2)` | NO | — | Monto del gasto (0.01 - 1,000,000.00) |
| 6 | `fecha_registro` | `DATETIME` | NO | `GETDATE()` | Timestamp server de Firestore |
| 7 | `creado_por` | `VARCHAR(100)` | SI | NULL | Email o UID del usuario creador |

**Restricciones:**
- PK: `id`
- FK: `inventario_id` REFERENCES `inventario(id)` ON DELETE SET NULL
- CHECK: `monto >= 0.01 AND monto <= 1000000`
- INDEX: `idx_gastos_fecha` en `fecha_registro`
- INDEX: `idx_gastos_producto` en `inventario_id`

---

## 9. Script DDL Completo

```sql
-- ============================================================
-- SISTEMA DE GESTION DE PANADERIA
-- Script de creacion de esquema (SQL Server / T-SQL)
-- ============================================================

USE master;
GO

-- Crear base de datos (opcional)
IF DB_ID('panaderia_db') IS NULL
BEGIN
    CREATE DATABASE panaderia_db;
END
GO

USE panaderia_db;
GO

-- ============================================================
-- TABLA: empleados
-- ============================================================
CREATE TABLE empleados (
    id              INT IDENTITY(1,1)   NOT NULL,
    nombre          VARCHAR(50)         NOT NULL,
    telefono        VARCHAR(20)         NULL,
    estado          VARCHAR(10)         NOT NULL    DEFAULT 'activo',
    fecha_registro  DATETIME            NOT NULL    DEFAULT GETDATE(),

    CONSTRAINT pk_empleados          PRIMARY KEY (id),
    CONSTRAINT uq_empleados_nombre   UNIQUE (nombre),
    CONSTRAINT ck_empleados_estado   CHECK (estado IN ('activo', 'inactivo'))
);
GO

-- ============================================================
-- TABLA: clientes
-- ============================================================
CREATE TABLE clientes (
    id              INT IDENTITY(1,1)   NOT NULL,
    nombre          VARCHAR(80)         NOT NULL,
    nombre_norm     VARCHAR(80)         NOT NULL,
    telefono        VARCHAR(20)         NULL,
    fecha_registro  DATETIME            NOT NULL    DEFAULT GETDATE(),
    creado_por      VARCHAR(100)        NULL,

    CONSTRAINT pk_clientes            PRIMARY KEY (id),
    CONSTRAINT uq_clientes_nombreNorm UNIQUE (nombre_norm)
);
GO

CREATE INDEX idx_clientes_nombre_norm ON clientes(nombre_norm);
GO

-- ============================================================
-- TABLA: inventario
-- ============================================================
CREATE TABLE inventario (
    id              INT IDENTITY(1,1)   NOT NULL,
    nombre          VARCHAR(80)         NOT NULL,
    nombre_norm     VARCHAR(80)         NOT NULL,
    fecha_registro  DATETIME            NOT NULL    DEFAULT GETDATE(),

    CONSTRAINT pk_inventario              PRIMARY KEY (id),
    CONSTRAINT uq_inventario_nombreNorm   UNIQUE (nombre_norm)
);
GO

-- ============================================================
-- TABLA: adelantos
-- ============================================================
CREATE TABLE adelantos (
    id              INT IDENTITY(1,1)   NOT NULL,
    empleado_id     INT                 NOT NULL,
    monto           DECIMAL(10,2)       NOT NULL,
    concepto        VARCHAR(120)        NULL        DEFAULT 'Adelanto',
    dia             VARCHAR(10)         NOT NULL,
    fecha_registro  DATETIME            NOT NULL    DEFAULT GETDATE(),
    creado_por      VARCHAR(100)        NULL,

    CONSTRAINT pk_adelantos             PRIMARY KEY (id),
    CONSTRAINT fk_adelantos_empleado    FOREIGN KEY (empleado_id) REFERENCES empleados(id),
    CONSTRAINT ck_adelantos_monto       CHECK (monto >= 0.01 AND monto <= 1000000),
    CONSTRAINT ck_adelantos_dia         CHECK (dia LIKE '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
GO

CREATE INDEX idx_adelantos_empleado ON adelantos(empleado_id);
CREATE INDEX idx_adelantos_dia      ON adelantos(dia);
GO

-- ============================================================
-- TABLA: pagos_personal
-- ============================================================
CREATE TABLE pagos_personal (
    id              INT IDENTITY(1,1)   NOT NULL,
    empleado_id     INT                 NOT NULL,
    monto           DECIMAL(10,2)       NOT NULL,
    concepto        VARCHAR(120)        NULL        DEFAULT 'Pago de jornal',
    dia             VARCHAR(10)         NOT NULL,
    fecha_registro  DATETIME            NOT NULL    DEFAULT GETDATE(),
    creado_por      VARCHAR(100)        NULL,

    CONSTRAINT pk_pagos_personal            PRIMARY KEY (id),
    CONSTRAINT fk_pagos_personal_empleado   FOREIGN KEY (empleado_id) REFERENCES empleados(id),
    CONSTRAINT ck_pagos_personal_monto      CHECK (monto >= 0.01 AND monto <= 1000000),
    CONSTRAINT ck_pagos_personal_dia        CHECK (dia LIKE '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
GO

CREATE INDEX idx_pagos_empleado ON pagos_personal(empleado_id);
CREATE INDEX idx_pagos_dia      ON pagos_personal(dia);
GO

-- ============================================================
-- TABLA: ventas
-- ============================================================
CREATE TABLE ventas (
    id                  INT IDENTITY(1,1)   NOT NULL,
    cliente_id          INT                 NULL,
    cliente_nombre      VARCHAR(80)         NOT NULL    DEFAULT 'Cliente General',
    cantidad_fundas     INT                 NOT NULL,
    total_venta         DECIMAL(10,2)       NOT NULL,
    estado_pago         VARCHAR(10)         NOT NULL    DEFAULT 'pagado',
    monto_abono         DECIMAL(10,2)       NULL,
    fecha_venta         DATETIME            NOT NULL,
    fecha_registro      DATETIME            NOT NULL    DEFAULT GETDATE(),
    creado_por          VARCHAR(100)        NULL,

    CONSTRAINT pk_ventas               PRIMARY KEY (id),
    CONSTRAINT fk_ventas_cliente       FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    CONSTRAINT ck_ventas_estado        CHECK (estado_pago IN ('pagado', 'debe', 'abono')),
    CONSTRAINT ck_ventas_cantidad      CHECK (cantidad_fundas >= 0 AND cantidad_fundas <= 999),
    CONSTRAINT ck_ventas_total         CHECK (total_venta > 0 AND total_venta <= 1000000),
    CONSTRAINT ck_ventas_abono         CHECK (monto_abono IS NULL OR (monto_abono >= 0.01 AND monto_abono <= 1000000))
);
GO

CREATE INDEX idx_ventas_estado_fecha  ON ventas(estado_pago, fecha_venta);
CREATE INDEX idx_ventas_fecha         ON ventas(fecha_venta);
CREATE INDEX idx_ventas_cliente       ON ventas(cliente_id);
GO

-- ============================================================
-- TABLA: gastos_inventario
-- ============================================================
CREATE TABLE gastos_inventario (
    id              INT IDENTITY(1,1)   NOT NULL,
    inventario_id   INT                 NULL,
    producto        VARCHAR(80)         NOT NULL,
    producto_norm   VARCHAR(80)         NOT NULL,
    monto           DECIMAL(10,2)       NOT NULL,
    fecha_registro  DATETIME            NOT NULL    DEFAULT GETDATE(),
    creado_por      VARCHAR(100)        NULL,

    CONSTRAINT pk_gastos_inventario            PRIMARY KEY (id),
    CONSTRAINT fk_gastos_inventario_producto   FOREIGN KEY (inventario_id) REFERENCES inventario(id) ON DELETE SET NULL,
    CONSTRAINT ck_gastos_inventario_monto      CHECK (monto >= 0.01 AND monto <= 1000000)
);
GO

CREATE INDEX idx_gastos_fecha     ON gastos_inventario(fecha_registro);
CREATE INDEX idx_gastos_producto  ON gastos_inventario(inventario_id);
GO
```

---

## 10. Scripts de Insercion (Datos de Prueba)

> Los datos representan un mes de operaciones ficticias de la panaderia.
> Los IDs se asignan en orden de insercion (1, 2, 3...).
> Las fechas cubren el periodo **2026-07-15 al 2026-08-17**.

```sql
-- ============================================================
-- INSERCION DE EMPLEADOS
-- ============================================================
INSERT INTO empleados (nombre, telefono, estado) VALUES
('Patucho',  '0991234567', 'activo'),
('Lucho',    '0992345678', 'activo'),
('Flaquito', '0993456789', 'activo');
GO

-- ============================================================
-- INSERCION DE CLIENTES
-- ============================================================
INSERT INTO clientes (nombre, nombre_norm, telefono, fecha_registro, creado_por) VALUES
('Maria Lopez',          'maria lopez',          '0991112233', '2026-07-15 08:00:00', 'admin@panaderia.com'),
('Juan Perez',           'juan perez',           '0992223344', '2026-07-15 08:05:00', 'admin@panaderia.com'),
('Rosa Garcia',          'rosa garcia',          '0993334455', '2026-07-16 09:00:00', 'admin@panaderia.com'),
('Pedro Castillo',       'pedro castillo',       '0994445566', '2026-07-18 10:00:00', 'admin@panaderia.com'),
('Ana Mendoza',          'ana mendoza',          '0995556677', '2026-07-20 08:30:00', 'admin@panaderia.com'),
('Carlos Ramirez',       'carlos ramirez',       '0996667788', '2026-07-22 11:00:00', 'admin@panaderia.com'),
('Lucia Fernandez',      'lucia fernandez',      '0997778899', '2026-07-25 09:15:00', 'admin@panaderia.com'),
('Roberto Diaz',         'roberto diaz',         '0998889900', '2026-07-28 08:45:00', 'admin@panaderia.com'),
('Patricia Vargas',      'patricia vargas',      '0999990011', '2026-08-01 10:00:00', 'admin@panaderia.com'),
('Fernando Torres',      'fernando torres',      '0990001122', '2026-08-05 09:30:00', 'admin@panaderia.com'),
('Sofia Reyes',          'sofia reyes',          '0991112200', '2026-08-10 08:00:00', 'admin@panaderia.com'),
('Diego Morales',        'diego morales',        '0992223300', '2026-08-12 11:00:00', 'admin@panaderia.com');
GO

-- ============================================================
-- INSERCION DE INVENTARIO (PRODUCTOS/INSUMOS)
-- ============================================================
INSERT INTO inventario (nombre, nombre_norm, fecha_registro) VALUES
('Harina de trigo',      'harina de trigo',      '2026-07-15 07:00:00'),
('Azucar',               'azucar',               '2026-07-15 07:00:00'),
('Mantequilla',          'mantequilla',          '2026-07-15 07:00:00'),
('Huevos',               'huevos',               '2026-07-15 07:00:00'),
('Leche',                'leche',                '2026-07-15 07:00:00'),
('Levadura',             'levadura',             '2026-07-15 07:00:00'),
('Sal',                  'sal',                  '2026-07-15 07:00:00'),
('Esencia de vainilla',  'esencia de vainilla',  '2026-07-15 07:00:00'),
('Canela en polvo',      'canela en polvo',      '2026-07-15 07:00:00'),
('Chocolate en polvo',   'chocolate en polvo',   '2026-07-15 07:00:00'),
('Margarina',            'margarina',            '2026-07-15 07:00:00'),
('Polvo de hornear',     'polvo de hornear',     '2026-07-15 07:00:00'),
('Fundas para pan',      'fundas para pan',      '2026-07-15 07:00:00');
GO

-- ============================================================
-- INSERCION DE ADELANTOS
-- ============================================================
INSERT INTO adelantos (empleado_id, monto, concepto, dia, fecha_registro) VALUES
-- Semana 1 (15-21 jul)
(1, 20.00, 'Adelanto para gastos personales',     '2026-07-15', '2026-07-15 06:30:00'),
(2, 15.00, 'Adelanto para transporte',             '2026-07-15', '2026-07-15 06:30:00'),
(3, 25.00, 'Adelanto urgente',                     '2026-07-17', '2026-07-17 06:30:00'),
-- Semana 2 (22-28 jul)
(1, 30.00, 'Adelanto para medicinas',              '2026-07-22', '2026-07-22 06:30:00'),
(2, 20.00, 'Adelanto semanal',                     '2026-07-24', '2026-07-24 06:30:00'),
(3, 10.00, 'Adelanto para comida',                 '2026-07-25', '2026-07-25 06:30:00'),
-- Semana 3 (29 jul - 4 ago)
(1, 15.00, 'Adelanto',                             '2026-07-29', '2026-07-29 06:30:00'),
(2, 25.00, 'Adelanto para factura',                '2026-07-30', '2026-07-30 06:30:00'),
(3, 20.00, 'Adelanto semanal',                     '2026-08-01', '2026-08-01 06:30:00'),
-- Semana 4 (5-11 ago)
(1, 20.00, 'Adelanto para alquiler',               '2026-08-05', '2026-08-05 06:30:00'),
(2, 15.00, 'Adelanto para transporte',             '2026-08-07', '2026-08-07 06:30:00'),
(3, 30.00, 'Adelanto urgente medicina',            '2026-08-08', '2026-08-08 06:30:00'),
-- Semana 5 (12-17 ago)
(1, 25.00, 'Adelanto semanal',                     '2026-08-12', '2026-08-12 06:30:00'),
(2, 20.00, 'Adelanto para útiles',                 '2026-08-14', '2026-08-14 06:30:00'),
(3, 15.00, 'Adelanto para comida',                 '2026-08-15', '2026-08-15 06:30:00');
GO

-- ============================================================
-- INSERCION DE PAGOS PERSONAL (Jornales)
-- ============================================================
INSERT INTO pagos_personal (empleado_id, monto, concepto, dia, fecha_registro) VALUES
-- Semana 1 (15-21 jul) - Liquidacion semanal
(1, 80.00, 'Pago de jornal semanal',    '2026-07-21', '2026-07-21 18:00:00'),
(2, 75.00, 'Pago de jornal semanal',    '2026-07-21', '2026-07-21 18:00:00'),
(3, 85.00, 'Pago de jornal semanal',    '2026-07-21', '2026-07-21 18:00:00'),
-- Semana 2 (22-28 jul)
(1, 80.00, 'Pago de jornal semanal',    '2026-07-28', '2026-07-28 18:00:00'),
(2, 75.00, 'Pago de jornal semanal',    '2026-07-28', '2026-07-28 18:00:00'),
(3, 85.00, 'Pago de jornal semanal',    '2026-07-28', '2026-07-28 18:00:00'),
-- Semana 3 (29 jul - 4 ago)
(1, 80.00, 'Pago de jornal semanal',    '2026-08-04', '2026-08-04 18:00:00'),
(2, 75.00, 'Pago de jornal semanal',    '2026-08-04', '2026-08-04 18:00:00'),
(3, 85.00, 'Pago de jornal semanal',    '2026-08-04', '2026-08-04 18:00:00'),
-- Semana 4 (5-11 ago)
(1, 80.00, 'Pago de jornal semanal',    '2026-08-11', '2026-08-11 18:00:00'),
(2, 75.00, 'Pago de jornal semanal',    '2026-08-11', '2026-08-11 18:00:00'),
(3, 85.00, 'Pago de jornal semanal',    '2026-08-11', '2026-08-11 18:00:00'),
-- Semana 5 (12-17 ago) - Pagos parciales de la semana en curso
(1, 80.00, 'Pago de jornal semanal',    '2026-08-17', '2026-08-17 18:00:00'),
(2, 75.00, 'Pago de jornal semanal',    '2026-08-17', '2026-08-17 18:00:00'),
(3, 85.00, 'Pago de jornal semanal',    '2026-08-17', '2026-08-17 18:00:00');
GO

-- ============================================================
-- INSERCION DE VENTAS
-- ============================================================

-- ---- Semana 1: 15 al 21 jul ----
INSERT INTO ventas (cliente_id, cliente_nombre, cantidad_fundas, total_venta, estado_pago, fecha_venta, fecha_registro) VALUES
(1,  'Maria Lopez',      10, 10.00, 'pagado',  '2026-07-15 07:30:00', '2026-07-15 07:30:00'),
(2,  'Juan Perez',        5,  5.00, 'pagado',  '2026-07-15 08:00:00', '2026-07-15 08:00:00'),
(NULL,'Cliente General',  8,  8.00, 'pagado',  '2026-07-15 09:00:00', '2026-07-15 09:00:00'),
(3,  'Rosa Garcia',      15, 15.00, 'pagado',  '2026-07-16 07:00:00', '2026-07-16 07:00:00'),
(NULL,'Cliente General',  20, 20.00, 'pagado',  '2026-07-16 08:30:00', '2026-07-16 08:30:00'),
(1,  'Maria Lopez',      12, 12.00, 'pagado',  '2026-07-17 07:15:00', '2026-07-17 07:15:00'),
(4,  'Pedro Castillo',   25, 25.00, 'pagado',  '2026-07-17 08:00:00', '2026-07-17 08:00:00'),
(2,  'Juan Perez',       30, 30.00, 'debe',    '2026-07-18 07:00:00', '2026-07-18 07:00:00'),
(NULL,'Cliente General',  10, 10.00, 'pagado',  '2026-07-18 09:30:00', '2026-07-18 09:30:00'),
(5,  'Ana Mendoza',      18, 18.00, 'pagado',  '2026-07-19 07:00:00', '2026-07-19 07:00:00'),
(NULL,'Cliente General',   8,  8.00, 'pagado',  '2026-07-19 08:45:00', '2026-07-19 08:45:00'),
(3,  'Rosa Garcia',      22, 22.00, 'pagado',  '2026-07-20 07:30:00', '2026-07-20 07:30:00'),
(1,  'Maria Lopez',      14, 14.00, 'pagado',  '2026-07-21 07:00:00', '2026-07-21 07:00:00');

-- ---- Semana 2: 22 al 28 jul ----
INSERT INTO ventas (cliente_id, cliente_nombre, cantidad_fundas, total_venta, estado_pago, fecha_venta, fecha_registro) VALUES
(4,  'Pedro Castillo',   20, 20.00, 'pagado',  '2026-07-22 07:00:00', '2026-07-22 07:00:00'),
(NULL,'Cliente General',  35, 35.00, 'pagado',  '2026-07-22 08:30:00', '2026-07-22 08:30:00'),
(6,  'Carlos Ramirez',   15, 15.00, 'pagado',  '2026-07-23 07:15:00', '2026-07-23 07:15:00'),
(5,  'Ana Mendoza',      25, 25.00, 'debe',    '2026-07-23 09:00:00', '2026-07-23 09:00:00'),
(1,  'Maria Lopez',      10, 10.00, 'pagado',  '2026-07-24 07:00:00', '2026-07-24 07:00:00'),
(2,  'Juan Perez',       18, 18.00, 'pagado',  '2026-07-24 08:00:00', '2026-07-24 08:00:00'),
(7,  'Lucia Fernandez',  30, 30.00, 'pagado',  '2026-07-25 07:00:00', '2026-07-25 07:00:00'),
(NULL,'Cliente General',  12, 12.00, 'pagado',  '2026-07-25 09:15:00', '2026-07-25 09:15:00'),
(3,  'Rosa Garcia',      22, 22.00, 'pagado',  '2026-07-26 07:00:00', '2026-07-26 07:00:00'),
(8,  'Roberto Diaz',     40, 40.00, 'pagado',  '2026-07-26 08:30:00', '2026-07-26 08:30:00'),
(4,  'Pedro Castillo',   16, 16.00, 'debe',    '2026-07-27 07:00:00', '2026-07-27 07:00:00'),
(1,  'Maria Lopez',      20, 20.00, 'pagado',  '2026-07-28 07:00:00', '2026-07-28 07:00:00'),
(6,  'Carlos Ramirez',   28, 28.00, 'pagado',  '2026-07-28 08:00:00', '2026-07-28 08:00:00');

-- ---- Semana 3: 29 jul al 4 ago ----
INSERT INTO ventas (cliente_id, cliente_nombre, cantidad_fundas, total_venta, estado_pago, fecha_venta, fecha_registro) VALUES
(5,  'Ana Mendoza',      30, 30.00, 'pagado',  '2026-07-29 07:00:00', '2026-07-29 07:00:00'),
(NULL,'Cliente General',  15, 15.00, 'pagado',  '2026-07-29 08:30:00', '2026-07-29 08:30:00'),
(2,  'Juan Perez',       22, 22.00, 'pagado',  '2026-07-30 07:00:00', '2026-07-30 07:00:00'),
(7,  'Lucia Fernandez',  18, 18.00, 'debe',    '2026-07-30 09:00:00', '2026-07-30 09:00:00'),
(3,  'Rosa Garcia',      25, 25.00, 'pagado',  '2026-07-31 07:00:00', '2026-07-31 07:00:00'),
(8,  'Roberto Diaz',     12, 12.00, 'pagado',  '2026-07-31 08:15:00', '2026-07-31 08:15:00'),
(1,  'Maria Lopez',      35, 35.00, 'pagado',  '2026-08-01 07:00:00', '2026-08-01 07:00:00'),
(9,  'Patricia Vargas',  20, 20.00, 'pagado',  '2026-08-02 07:30:00', '2026-08-02 07:30:00'),
(4,  'Pedro Castillo',   28, 28.00, 'pagado',  '2026-08-03 07:00:00', '2026-08-03 07:00:00'),
(6,  'Carlos Ramirez',   10, 10.00, 'pagado',  '2026-08-04 07:00:00', '2026-08-04 07:00:00'),
(NULL,'Cliente General',  42, 42.00, 'pagado',  '2026-08-04 08:30:00', '2026-08-04 08:30:00');

-- ---- Semana 4: 5 al 11 ago ----
INSERT INTO ventas (cliente_id, cliente_nombre, cantidad_fundas, total_venta, estado_pago, fecha_venta, fecha_registro) VALUES
(10, 'Fernando Torres',  25, 25.00, 'pagado',  '2026-08-05 07:00:00', '2026-08-05 07:00:00'),
(1,  'Maria Lopez',      15, 15.00, 'pagado',  '2026-08-05 08:00:00', '2026-08-05 08:00:00'),
(NULL,'Cliente General',  30, 30.00, 'pagado',  '2026-08-06 07:00:00', '2026-08-06 07:00:00'),
(5,  'Ana Mendoza',      20, 20.00, 'debe',    '2026-08-06 09:00:00', '2026-08-06 09:00:00'),
(3,  'Rosa Garcia',      18, 18.00, 'pagado',  '2026-08-07 07:00:00', '2026-08-07 07:00:00'),
(8,  'Roberto Diaz',     35, 35.00, 'pagado',  '2026-08-07 08:30:00', '2026-08-07 08:30:00'),
(2,  'Juan Perez',       12, 12.00, 'pagado',  '2026-08-08 07:00:00', '2026-08-08 07:00:00'),
(7,  'Lucia Fernandez',  28, 28.00, 'pagado',  '2026-08-09 07:00:00', '2026-08-09 07:00:00'),
(9,  'Patricia Vargas',  22, 22.00, 'pagado',  '2026-08-10 07:30:00', '2026-08-10 07:30:00'),
(4,  'Pedro Castillo',   45, 45.00, 'pagado',  '2026-08-11 07:00:00', '2026-08-11 07:00:00'),
(1,  'Maria Lopez',      10, 10.00, 'pagado',  '2026-08-11 08:00:00', '2026-08-11 08:00:00');

-- ---- Semana 5: 12 al 17 ago ----
INSERT INTO ventas (cliente_id, cliente_nombre, cantidad_fundas, total_venta, estado_pago, fecha_venta, fecha_registro) VALUES
(6,  'Carlos Ramirez',   20, 20.00, 'pagado',  '2026-08-12 07:00:00', '2026-08-12 07:00:00'),
(11, 'Sofia Reyes',      15, 15.00, 'pagado',  '2026-08-12 08:00:00', '2026-08-12 08:00:00'),
(3,  'Rosa Garcia',      25, 25.00, 'pagado',  '2026-08-13 07:00:00', '2026-08-13 07:00:00'),
(12, 'Diego Morales',    30, 30.00, 'debe',    '2026-08-13 09:00:00', '2026-08-13 09:00:00'),
(1,  'Maria Lopez',      18, 18.00, 'pagado',  '2026-08-14 07:00:00', '2026-08-14 07:00:00'),
(NULL,'Cliente General',  40, 40.00, 'pagado',  '2026-08-14 08:30:00', '2026-08-14 08:30:00'),
(10, 'Fernando Torres',  22, 22.00, 'pagado',  '2026-08-15 07:00:00', '2026-08-15 07:00:00'),
(5,  'Ana Mendoza',      12, 12.00, 'pagado',  '2026-08-16 07:00:00', '2026-08-16 07:00:00'),
(8,  'Roberto Diaz',     50, 50.00, 'pagado',  '2026-08-16 08:00:00', '2026-08-16 08:00:00'),
(2,  'Juan Perez',       16, 16.00, 'pagado',  '2026-08-17 07:00:00', '2026-08-17 07:00:00'),
(4,  'Pedro Castillo',   20, 20.00, 'pagado',  '2026-08-17 08:00:00', '2026-08-17 08:00:00'),
(9,  'Patricia Vargas',  30, 30.00, 'pagado',  '2026-08-17 09:00:00', '2026-08-17 09:00:00');
GO

-- ---- Abonos (ventas con estado 'abono') ----
-- Juan Perez abona parte de su deuda del 18 jul
INSERT INTO ventas (cliente_id, cliente_nombre, cantidad_fundas, total_venta, estado_pago, monto_abono, fecha_venta, fecha_registro) VALUES
(2, 'Juan Perez', 0, 15.00, 'abono', 15.00, '2026-07-25 10:00:00', '2026-07-25 10:00:00');

-- Ana Mendoza abona parte de su deuda del 23 jul
INSERT INTO ventas (cliente_id, cliente_nombre, cantidad_fundas, total_venta, estado_pago, monto_abono, fecha_venta, fecha_registro) VALUES
(5, 'Ana Mendoza', 0, 10.00, 'abono', 10.00, '2026-07-28 10:00:00', '2026-07-28 10:00:00');

-- Pedro Castillo abona parte de su deuda del 27 jul
INSERT INTO ventas (cliente_id, cliente_nombre, cantidad_fundas, total_venta, estado_pago, monto_abono, fecha_venta, fecha_registro) VALUES
(4, 'Pedro Castillo', 0, 10.00, 'abono', 10.00, '2026-08-01 10:00:00', '2026-08-01 10:00:00');

-- Lucia Fernandez abona parte de su deuda del 30 jul
INSERT INTO ventas (cliente_id, cliente_nombre, cantidad_fundas, total_venta, estado_pago, monto_abono, fecha_venta, fecha_registro) VALUES
(7, 'Lucia Fernandez', 0, 12.00, 'abono', 12.00, '2026-08-05 10:00:00', '2026-08-05 10:00:00');

-- Ana Mendoza abona el resto de su deuda del 23 jul
INSERT INTO ventas (cliente_id, cliente_nombre, cantidad_fundas, total_venta, estado_pago, monto_abono, fecha_venta, fecha_registro) VALUES
(5, 'Ana Mendoza', 0, 15.00, 'abono', 15.00, '2026-08-08 10:00:00', '2026-08-08 10:00:00');

-- Diego Morales abona parte de su deuda del 13 ago
INSERT INTO ventas (cliente_id, cliente_nombre, cantidad_fundas, total_venta, estado_pago, monto_abono, fecha_venta, fecha_registro) VALUES
(12, 'Diego Morales', 0, 15.00, 'abono', 15.00, '2026-08-16 10:00:00', '2026-08-16 10:00:00');
GO

-- ============================================================
-- INSERCION DE GASTOS DE INVENTARIO
-- ============================================================
INSERT INTO gastos_inventario (inventario_id, producto, producto_norm, monto, fecha_registro) VALUES
-- Semana 1 (15-21 jul)
(1,  'Harina de trigo',      'harina de trigo',      45.00, '2026-07-15 06:00:00'),
(2,  'Azucar',               'azucar',               18.50, '2026-07-15 06:00:00'),
(4,  'Huevos',               'huevos',               22.00, '2026-07-16 06:00:00'),
(6,  'Levadura',             'levadura',              8.00, '2026-07-17 06:00:00'),
(13, 'Fundas para pan',      'fundas para pan',      12.00, '2026-07-18 06:00:00'),
(3,  'Mantequilla',          'mantequilla',          30.00, '2026-07-19 06:00:00'),
(5,  'Leche',                'leche',                15.00, '2026-07-20 06:00:00'),
-- Semana 2 (22-28 jul)
(1,  'Harina de trigo',      'harina de trigo',      50.00, '2026-07-22 06:00:00'),
(2,  'Azucar',               'azucar',               20.00, '2026-07-22 06:00:00'),
(4,  'Huevos',               'huevos',               25.00, '2026-07-23 06:00:00'),
(8,  'Esencia de vainilla',  'esencia de vainilla',   6.50, '2026-07-24 06:00:00'),
(10, 'Chocolate en polvo',   'chocolate en polvo',   14.00, '2026-07-25 06:00:00'),
(11, 'Margarina',            'margarina',            22.00, '2026-07-26 06:00:00'),
(13, 'Fundas para pan',      'fundas para pan',      12.00, '2026-07-27 06:00:00'),
-- Semana 3 (29 jul - 4 ago)
(1,  'Harina de trigo',      'harina de trigo',      48.00, '2026-07-29 06:00:00'),
(3,  'Mantequilla',          'mantequilla',          32.00, '2026-07-30 06:00:00'),
(6,  'Levadura',             'levadura',              8.00, '2026-07-31 06:00:00'),
(9,  'Canela en polvo',      'canela en polvo',       5.00, '2026-08-01 06:00:00'),
(12, 'Polvo de hornear',     'polvo de hornear',      7.50, '2026-08-02 06:00:00'),
(5,  'Leche',                'leche',                16.00, '2026-08-03 06:00:00'),
(13, 'Fundas para pan',      'fundas para pan',      12.00, '2026-08-04 06:00:00'),
-- Semana 4 (5-11 ago)
(1,  'Harina de trigo',      'harina de trigo',      52.00, '2026-08-05 06:00:00'),
(2,  'Azucar',               'azucar',               19.00, '2026-08-05 06:00:00'),
(4,  'Huevos',               'huevos',               24.00, '2026-08-06 06:00:00'),
(3,  'Mantequilla',          'mantequilla',          28.00, '2026-08-07 06:00:00'),
(10, 'Chocolate en polvo',   'chocolate en polvo',   15.00, '2026-08-08 06:00:00'),
(8,  'Esencia de vainilla',  'esencia de vainilla',   7.00, '2026-08-09 06:00:00'),
(13, 'Fundas para pan',      'fundas para pan',      12.00, '2026-08-10 06:00:00'),
(6,  'Levadura',             'levadura',              8.00, '2026-08-11 06:00:00'),
-- Semana 5 (12-17 ago)
(1,  'Harina de trigo',      'harina de trigo',      47.00, '2026-08-12 06:00:00'),
(2,  'Azucar',               'azucar',               21.00, '2026-08-12 06:00:00'),
(11, 'Margarina',            'margarina',            23.00, '2026-08-13 06:00:00'),
(5,  'Leche',                'leche',                17.00, '2026-08-14 06:00:00'),
(4,  'Huevos',               'huevos',               26.00, '2026-08-15 06:00:00'),
(3,  'Mantequilla',          'mantequilla',          31.00, '2026-08-16 06:00:00'),
(13, 'Fundas para pan',      'fundas para pan',      12.00, '2026-08-17 06:00:00');
GO
```

---

## 11. Vistas y Consultas Frecuentes

```sql
-- ============================================================
-- VISTA: Resumen semanal de empleados (tarjetas del dashboard)
-- Reinicia automaticamente cada lunes
-- ============================================================
CREATE OR ALTER VIEW vw_resumen_semanal_empleados AS
WITH semana AS (
    SELECT
        e.id            AS empleado_id,
        e.nombre        AS empleado,
        ISNULL(SUM(a.monto), 0)  AS total_adelantos,
        ISNULL(SUM(p.monto), 0)  AS total_pagos,
        ISNULL(SUM(p.monto), 0) - ISNULL(SUM(a.monto), 0) AS balance
    FROM empleados e
    LEFT JOIN adelantos a
        ON a.empleado_id = e.id
        AND a.dia >= FORMAT(
            DATEADD(DAY, -((DATEPART(WEEKDAY, GETDATE()) + 5) % 7), CAST(GETDATE() AS DATE)),
            'yyyy-MM-dd')
        AND a.dia <= FORMAT(CAST(GETDATE() AS DATE), 'yyyy-MM-dd')
    LEFT JOIN pagos_personal p
        ON p.empleado_id = e.id
        AND p.dia >= FORMAT(
            DATEADD(DAY, -((DATEPART(WEEKDAY, GETDATE()) + 5) % 7), CAST(GETDATE() AS DATE)),
            'yyyy-MM-dd')
        AND p.dia <= FORMAT(CAST(GETDATE() AS DATE), 'yyyy-MM-dd')
    WHERE e.estado = 'activo'
    GROUP BY e.id, e.nombre
);
GO

-- ============================================================
-- VISTA: Reporte historico de empleados (sin filtro semanal)
-- ============================================================
CREATE OR ALTER VIEW vw_reporte_historico_empleados AS
SELECT
    e.nombre                                    AS empleado,
    a.dia                                       AS fecha,
    a.monto                                     AS monto_adelanto,
    a.concepto                                  AS concepto_adelanto,
    NULL                                        AS monto_pago,
    NULL                                        AS concepto_pago
FROM adelantos a
JOIN empleados e ON e.id = a.empleado_id
UNION ALL
SELECT
    e.nombre                                    AS empleado,
    p.dia                                       AS fecha,
    NULL                                        AS monto_adelanto,
    NULL                                        AS concepto_adelanto,
    p.monto                                     AS monto_pago,
    p.concepto                                  AS concepto_pago
FROM pagos_personal p
JOIN empleados e ON e.id = p.empleado_id;
GO

-- ============================================================
-- CONSULTA: Totales por empleado en rango de fechas (reportes)
-- ============================================================
-- Parametros: @fecha_inicio, @fecha_fin
-- Ignora el filtro de semana actual
/*
SELECT
    e.nombre                                        AS trabajador,
    ISNULL(SUM(CASE WHEN a.id IS NOT NULL THEN a.monto END), 0) AS total_adelantos,
    ISNULL(SUM(CASE WHEN p.id IS NOT NULL THEN p.monto END), 0) AS total_pagos_jornal,
    ISNULL(SUM(CASE WHEN p.id IS NOT NULL THEN p.monto END), 0)
      - ISNULL(SUM(CASE WHEN a.id IS NOT NULL THEN a.monto END), 0) AS balance
FROM empleados e
LEFT JOIN adelantos a
    ON a.empleado_id = e.id
    AND a.dia >= @fecha_inicio
    AND a.dia <= @fecha_fin
LEFT JOIN pagos_personal p
    ON p.empleado_id = e.id
    AND p.dia >= @fecha_inicio
    AND p.dia <= @fecha_fin
WHERE e.estado = 'activo'
GROUP BY e.nombre
ORDER BY e.nombre;
*/

-- ============================================================
-- CONSULTA: Historial completo de movimientos (tabla personal)
-- Sin filtro de fecha, muestra todo
-- ============================================================
/*
SELECT
    a.dia           AS fecha,
    e.nombre        AS trabajador,
    'adelanto'      AS tipo,
    a.concepto      AS concepto,
    a.monto         AS monto
FROM adelantos a
JOIN empleados e ON e.id = a.empleado_id

UNION ALL

SELECT
    p.dia           AS fecha,
    e.nombre        AS trabajador,
    'pago'          AS tipo,
    p.concepto      AS concepto,
    p.monto         AS monto
FROM pagos_personal p
JOIN empleados e ON e.id = p.empleado_id

ORDER BY fecha DESC;
*/

-- ============================================================
-- CONSULTA: Utilidad neta del periodo
-- ============================================================
/*
WITH ventas_periodo AS (
    SELECT ISNULL(SUM(total_venta), 0) AS total_ventas_contado
    FROM ventas
    WHERE estado_pago = 'pagado'
      AND fecha_venta >= @fecha_inicio
      AND fecha_venta <= @fecha_fin
),
gastos_periodo AS (
    SELECT ISNULL(SUM(monto), 0) AS total_gastos
    FROM gastos_inventario
    WHERE fecha_registro >= @fecha_inicio
      AND fecha_registro <= @fecha_fin
),
personal_periodo AS (
    SELECT
        ISNULL(SUM(p.monto), 0) AS total_pagos,
        ISNULL(SUM(a.monto), 0) AS total_adelantos
    FROM pagos_personal p
    LEFT JOIN adelantos a ON a.empleado_id = p.empleado_id
        AND a.dia >= @fecha_inicio AND a.dia <= @fecha_fin
    WHERE p.dia >= @fecha_inicio AND p.dia <= @fecha_fin
)
SELECT
    v.total_ventas_contado,
    g.total_gastos,
    pp.total_pagos,
    pp.total_adelantos,
    (pp.total_adelantos + (pp.total_pagos - pp.total_adelantos)) AS total_personal_entregado,
    v.total_ventas_contado - g.total_gastos
      - (pp.total_adelantos + (pp.total_pagos - pp.total_adelantos)) AS utilidad_neta
FROM ventas_periodo v, gastos_periodo g, personal_periodo pp;
*/
GO
```

---

## 12. Reglas de Validacion

| Campo | Regla Firestore | Equivalente SQL Server |
|-------|-----------------|------------------------|
| `trabajador` | `esTexto(..., 50)` | `VARCHAR(50) NOT NULL` |
| `monto` | `esMontoValido()`: `>= 0.01 AND <= 1000000` | `DECIMAL(10,2) CHECK (monto >= 0.01 AND monto <= 1000000)` |
| `concepto` | `esTexto(..., 120)` | `VARCHAR(120)` |
| `dia` | Regex `^\d{4}-\d{2}-\d{2}$` | `VARCHAR(10) CHECK (dia LIKE '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')` |
| `fecha` | `esFechaValida()` (Timestamp) | `DATETIME NOT NULL DEFAULT GETDATE()` |
| `cliente` | `esTexto(..., 80)` | `VARCHAR(80) NOT NULL` |
| `cantidadFundas` | `>= 0 AND <= 999`, entero | `INT CHECK (cantidad_fundas >= 0 AND cantidad_fundas <= 999)` |
| `totalVenta` | `> 0 AND <= 1000000` | `DECIMAL(10,2) CHECK (total_venta > 0 AND total_venta <= 1000000)` |
| `estadoPago` | `in ["pagado", "debe", "abono"]` | `VARCHAR(10) CHECK (estado_pago IN ('pagado', 'debe', 'abono'))` |
| `montoAbono` | `esMontoValido()`, solo si `estado_pago = 'abono'` | `DECIMAL(10,2) NULL CHECK (... OR monto_abono IS NULL)` |
| `nombre` (cliente/inv.) | `esTexto(..., 80)` | `VARCHAR(80) NOT NULL` |
| `nombreNorm` | `normalizarTexto()` | `VARCHAR(80) NOT NULL` |
| `telefono` | Opcional, `<= 20 chars`, solo digits y `+` | `VARCHAR(20) NULL` |
| `producto` | `esTexto(..., 80)` | `VARCHAR(80) NOT NULL` |
| `creadoPor` | Backend: `claims.email \|\| claims.uid` | `VARCHAR(100) NULL` |

### Constantes del Sistema

| Constante | Valor | Ubicacion |
|-----------|-------|-----------|
| `TRABAJADORES` | `["Patucho", "Lucho", "Flaquito"]` | `js/personal.js:8` |
| `PRECIO_FUNDA` | `1.00` | `js/ventas.js:7` |
| `LIMITES.TEXTO` | `80` | `backend/functions/index.js:37` |
| `LIMITES.CONCEPTO` | `120` | `backend/functions/index.js:38` |
| `LIMITES.MONTO_MIN` | `0.01` | `backend/functions/index.js:39` |
| `LIMITES.MONTO_MAX` | `1000000` | `backend/functions/index.js:40` |
| `LIMITES.CANTIDAD_MAX` | `999` | `backend/functions/index.js:41` |
| `ESTADOS_PAGO` | `["pagado", "debe", "abono"]` | `backend/functions/index.js:45` |

### Mapeo Firestore a SQL Server

| Firestore (NoSQL) | SQL Server (Relacional) |
|--------------------|------------------------|
| Coleccion `adelantos` | Tabla `adelantos` + FK `empleado_id` |
| Coleccion `pagos_personal` | Tabla `pagos_personal` + FK `empleado_id` |
| Coleccion `ventas` | Tabla `ventas` + FK `cliente_id` |
| Coleccion `gastos_inventario` | Tabla `gastos_inventario` + FK `inventario_id` |
| Coleccion `inventario` | Tabla `inventario` |
| Coleccion `clientes` | Tabla `clientes` |
| Array `TRABAJADORES` (hardcoded) | Tabla `empleados` |
| Campo `d.dia` (string `"YYYY-MM-DD"`) | `VARCHAR(10)` con CHECK de formato |
| `serverTimestamp()` | `DATETIME DEFAULT GETDATE()` |
| `FieldValue.serverTimestamp()` | `DATETIME DEFAULT GETDATE()` |
| `doc.id` (auto-generado) | `INT IDENTITY(1,1)` |
