/*
  # Add Role-Based Access Control to Works Table
  
  ## Overview
  This migration implements a comprehensive role-based access control system for the works table,
  supporting file tracking and role-based permissions.
  
  ## 1. Schema Setup
    - Create `estimate` schema if it doesn't exist
  
  ## 2. Works Table
    Creates the `works` table with all necessary fields including:
    - Basic work information (work_name, division, type, etc.)
    - Cost tracking fields
    - Role-based access fields:
      - `created_by`: User who created the work
      - `current_role_holder_id`: User currently holding the file
      - `current_role_id`: Role currently responsible for the file
      - `assigned_by`: User who assigned the file to current holder
      - `assigned_at`: Timestamp of last assignment
  
  ## 3. Role Hierarchy
    - Junior Engineer (JE) - Level 1
    - Sub-Divisional Engineer (SDE) - Level 2
    - Divisional Junior Engineer (Divisional JE) - Level 3
    - Executive Engineer (EE) - Level 4
  
  ## 4. Security (RLS Policies)
    - Users can view works assigned to their role
    - Users can view works they created
    - Higher-level roles can view works assigned to lower-level roles
    - Users can create new works
    - Only assigned role holders can update works
    - Executive Engineers (EE) have full access to all works
  
  ## 5. Helper Functions
    - Function to get user's role level
    - Function to check if user can access a work
  
  ## 6. Indexes
    - Indexes on role-related columns for efficient queries
    - Indexes on frequently queried columns
*/

-- Create estimate schema if not exists
CREATE SCHEMA IF NOT EXISTS estimate;

-- Drop existing helper functions if they exist
DROP FUNCTION IF EXISTS get_user_role_level(uuid);
DROP FUNCTION IF EXISTS get_user_role_id(uuid);

-- Create helper function to get user's role level
CREATE OR REPLACE FUNCTION get_user_role_level(user_uuid uuid)
RETURNS INTEGER AS $$
  SELECT COALESCE(MAX(r.level), 0)
  FROM public.user_roles ur
  JOIN public.roles r ON ur.role_id = r.id
  WHERE ur.user_id = user_uuid;
$$ LANGUAGE SQL STABLE;

-- Create helper function to get user's role ID
CREATE OR REPLACE FUNCTION get_user_role_id(user_uuid uuid)
RETURNS uuid AS $$
  SELECT ur.role_id
  FROM public.user_roles ur
  JOIN public.roles r ON ur.role_id = r.id
  WHERE ur.user_id = user_uuid
  ORDER BY r.level DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Create or update works table
CREATE TABLE IF NOT EXISTS estimate.works (
  sr_no SERIAL PRIMARY KEY,
  works_id text UNIQUE NOT NULL DEFAULT ('WRK-' || LPAD(nextval('estimate.works_sr_no_seq')::text, 6, '0')),
  type text NOT NULL DEFAULT 'Technical Sanction',
  work_name text NOT NULL,
  ssr text,
  division text,
  sub_division text,
  fund_head text,
  major_head text,
  minor_head text,
  service_head text,
  departmental_head text,
  sanctioning_authority text,
  status text NOT NULL DEFAULT 'draft',
  total_estimated_cost numeric DEFAULT 0,
  village text,
  grampanchayat text,
  taluka text,
  recap_json jsonb,
  
  -- Role-based access control fields
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_role_holder_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT valid_type CHECK (type IN ('Technical Sanction','Technical Approval')),
  CONSTRAINT valid_status CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'in_progress', 'completed'))
);

-- Enable RLS on works table
ALTER TABLE estimate.works ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view works assigned to their role" ON estimate.works;
  DROP POLICY IF EXISTS "Users can view works they created" ON estimate.works;
  DROP POLICY IF EXISTS "Higher roles can view lower role works" ON estimate.works;
  DROP POLICY IF EXISTS "EE has full read access" ON estimate.works;
  DROP POLICY IF EXISTS "Users can create works" ON estimate.works;
  DROP POLICY IF EXISTS "Assigned users can update works" ON estimate.works;
  DROP POLICY IF EXISTS "Creators can update draft works" ON estimate.works;
  DROP POLICY IF EXISTS "EE can update all works" ON estimate.works;
  DROP POLICY IF EXISTS "Creators can delete draft works" ON estimate.works;
  DROP POLICY IF EXISTS "EE can delete any work" ON estimate.works;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- RLS Policies for SELECT
CREATE POLICY "Users can view works assigned to their role"
  ON estimate.works
  FOR SELECT
  TO authenticated
  USING (
    current_role_holder_id = auth.uid() OR
    current_role_id = get_user_role_id(auth.uid())
  );

CREATE POLICY "Users can view works they created"
  ON estimate.works
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Higher roles can view lower role works"
  ON estimate.works
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur1
      JOIN public.roles r1 ON ur1.role_id = r1.id
      JOIN public.roles r2 ON estimate.works.current_role_id = r2.id
      WHERE ur1.user_id = auth.uid()
      AND r1.level >= r2.level
    )
  );

CREATE POLICY "EE has full read access"
  ON estimate.works
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'ee'
    )
  );

-- RLS Policies for INSERT
CREATE POLICY "Users can create works"
  ON estimate.works
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for UPDATE
CREATE POLICY "Assigned users can update works"
  ON estimate.works
  FOR UPDATE
  TO authenticated
  USING (
    current_role_holder_id = auth.uid() OR
    current_role_id = get_user_role_id(auth.uid())
  )
  WITH CHECK (
    current_role_holder_id = auth.uid() OR
    current_role_id = get_user_role_id(auth.uid())
  );

CREATE POLICY "Creators can update draft works"
  ON estimate.works
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() AND status = 'draft')
  WITH CHECK (created_by = auth.uid() AND status = 'draft');

CREATE POLICY "EE can update all works"
  ON estimate.works
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'ee'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'ee'
    )
  );

-- RLS Policies for DELETE
CREATE POLICY "Creators can delete draft works"
  ON estimate.works
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() AND status = 'draft');

CREATE POLICY "EE can delete any work"
  ON estimate.works
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'ee'
    )
  );

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_works_created_by ON estimate.works(created_by);
CREATE INDEX IF NOT EXISTS idx_works_current_role_holder_id ON estimate.works(current_role_holder_id);
CREATE INDEX IF NOT EXISTS idx_works_current_role_id ON estimate.works(current_role_id);
CREATE INDEX IF NOT EXISTS idx_works_status ON estimate.works(status);
CREATE INDEX IF NOT EXISTS idx_works_type ON estimate.works(type);
CREATE INDEX IF NOT EXISTS idx_works_works_id ON estimate.works(works_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_works_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS update_works_updated_at_trigger ON estimate.works;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE TRIGGER update_works_updated_at_trigger
  BEFORE UPDATE ON estimate.works
  FOR EACH ROW
  EXECUTE FUNCTION update_works_updated_at();