-- Create enums
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE deployment_status AS ENUM ('queued', 'building', 'success', 'failed');

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  status user_status NOT NULL DEFAULT 'active',
  preferences JSONB DEFAULT '{"theme": "dark", "notifications": true}'::jsonb,
  tags VARCHAR(50)[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_project_name CHECK (char_length(name) >= 3)
);

-- Deployments table
CREATE TABLE deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status deployment_status NOT NULL DEFAULT 'queued',
  build_log TEXT,
  commit_hash VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_deployments_project_id ON deployments(project_id);

-- Insert dummy data
INSERT INTO users (id, name, email, status, preferences, tags) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Manish Mittal', 'manish@example.com', 'active', '{"theme": "dark", "notifications": true}', ARRAY['dev', 'admin']),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Rahul Kumar', 'rahul@example.com', 'active', '{"theme": "light", "notifications": false}', ARRAY['design']),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'Amit Sharma', 'amit@example.com', 'inactive', '{"theme": "dark", "notifications": true}', ARRAY['marketing']);

INSERT INTO projects (id, user_id, name, description) VALUES
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a21', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'PostgresD Client', 'A modern PostgreSQL desktop client.'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Antigravity IDE', 'AI coding agent workbench.'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a23', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Portfolio App', 'Personal design portfolio.');

INSERT INTO deployments (project_id, status, commit_hash) VALUES
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a21', 'success', '7fa0a12b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a21', 'failed', '1ba0b12b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'building', '9ca0c12b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f');

-- Large dataset table for scale testing
CREATE TABLE large_dataset (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  metadata JSONB,
  tags VARCHAR(50)[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generate 1,000,000 rows in seconds
INSERT INTO large_dataset (name, email, category, metadata, tags, created_at)
SELECT 
  'User ' || i,
  'user' || i || '@example.com',
  (ARRAY['General', 'Enterprise', 'Premium', 'Standard'])[floor(random() * 4) + 1],
  json_build_object('age', floor(random() * 80) + 18, 'active', random() > 0.2),
  ARRAY['tag' || floor(random() * 5) + 1, 'tag' || floor(random() * 5) + 1],
  NOW() - (random() * interval '365 days')
FROM generate_series(1, 1000000) AS s(i);

CREATE INDEX idx_large_dataset_email ON large_dataset(email);
