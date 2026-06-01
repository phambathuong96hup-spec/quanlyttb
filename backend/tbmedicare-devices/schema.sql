CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Departments table
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Patients table
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_code VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    dob DATE NULL,
    gender VARCHAR(20) NULL,
    insurance_code VARCHAR(100) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Encounters table
CREATE TABLE IF NOT EXISTS encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    his_treatment_code VARCHAR(50) NOT NULL UNIQUE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    department_id UUID NULL REFERENCES departments(id),
    admission_at TIMESTAMPTZ NULL,
    discharge_at TIMESTAMPTZ NULL,
    icd_code VARCHAR(50) NULL,
    icd_name TEXT NULL,
    diagnosis TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active', -- active / discharged
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Machine Categories table
CREATE TABLE IF NOT EXISTS machine_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Machines table
CREATE TABLE IF NOT EXISTS machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_code VARCHAR(100) NOT NULL UNIQUE,
    machine_name VARCHAR(255) NOT NULL,
    category_id UUID NULL REFERENCES machine_categories(id) ON DELETE SET NULL,
    department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL,
    room_code VARCHAR(50) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'available', -- available / in_use / maintenance
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Device Usages table (Mỗi dòng ghi nhận 1 lần dùng máy của BN)
CREATE TABLE IF NOT EXISTS device_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    his_sere_serv_id BIGINT NULL UNIQUE,            -- ID dịch vụ kỹ thuật từ HIS để tránh trùng
    service_name TEXT NULL,                         -- Tên dịch vụ (ví dụ: Thở máy qua nội khí quản...)
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ NULL,                      -- NULL = đang sử dụng
    quantity NUMERIC(10, 2) NULL DEFAULT 1.0,
    status VARCHAR(30) NOT NULL DEFAULT 'in_use',   -- in_use / completed / cancelled
    ordered_by_name TEXT NULL,                      -- Bác sĩ chỉ định
    department_code VARCHAR(50) NULL,               -- Mã khoa gán máy
    note TEXT NULL,
    source_hash TEXT NULL,                          -- Dùng để so khớp thay đổi dữ liệu
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Sync Runs table (Ghi nhật ký sync)
CREATE TABLE IF NOT EXISTS sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ NULL,
    status VARCHAR(30) NOT NULL,                    -- running / success / failed
    total_records INTEGER NOT NULL DEFAULT 0,
    changed_records INTEGER NOT NULL DEFAULT 0,
    error_message TEXT NULL
);

-- Pre-seed some default machine categories
INSERT INTO machine_categories (code, name, description)
VALUES
    ('MAY_THO', 'Máy thở (Ventilator)', 'Các loại máy giúp thở, máy thở oxy dòng cao HFNC'),
    ('BOM_TIEM_DIEN', 'Bơm tiêm điện (Infusion Pump)', 'Bơm tiêm điện định lượng'),
    ('MAY_TRUYEN_DICH', 'Máy truyền dịch', 'Thiết bị hỗ trợ truyền dịch tự động'),
    ('MONITOR', 'Máy theo dõi bệnh nhân (Monitor)', 'Monitor theo dõi các chỉ số sinh tồn 5-7 thông số'),
    ('MAY_KHI_DUNG', 'Máy khí dung', 'Thiết bị xông khí dung'),
    ('KHAC', 'Thiết bị khác', 'Các thiết bị y tế khác')
ON CONFLICT (code) DO NOTHING;

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(code);
CREATE INDEX IF NOT EXISTS idx_patients_code ON patients(patient_code);
CREATE INDEX IF NOT EXISTS idx_encounters_treatment ON encounters(his_treatment_code);
CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_status ON encounters(status);
CREATE INDEX IF NOT EXISTS idx_machines_code ON machines(machine_code);
CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
CREATE INDEX IF NOT EXISTS idx_device_usages_encounter ON device_usages(encounter_id);
CREATE INDEX IF NOT EXISTS idx_device_usages_machine ON device_usages(machine_id);
CREATE INDEX IF NOT EXISTS idx_device_usages_status ON device_usages(status);
CREATE INDEX IF NOT EXISTS idx_device_usages_dates ON device_usages(started_at, ended_at);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON sync_runs(status, started_at DESC);
