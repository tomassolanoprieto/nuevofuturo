/*
  # Create work_hours table for employee time tracking

  1. New Tables
    - `work_hours`
      - `id` (uuid, primary key)
      - `employee_id` (uuid, references employee_profiles)
      - `date` (date)
      - `hours` (numeric)
      - `time_type` (text, matches time_entries time_type enum)
      - `work_center` (work_center_enum)
      - `clock_in` (timestamp with time zone)
      - `clock_out` (timestamp with time zone)
      - `is_split` (boolean)
      - `created_at` (timestamp with time zone)
      - `updated_at` (timestamp with time zone)

  2. Security
    - Enable RLS on `work_hours` table
    - Add policies for:
      - Employees to read their own records
      - Supervisors to read records for employees in their work centers
*/

-- Create work_hours table
CREATE TABLE IF NOT EXISTS work_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employee_profiles(id),
  date date NOT NULL,
  hours numeric NOT NULL,
  time_type text CHECK (time_type = ANY (ARRAY['turno', 'coordinacion', 'formacion', 'sustitucion', 'otros'])),
  work_center work_center_enum,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz NOT NULL,
  is_split boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_work_hours_employee_id ON work_hours(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_hours_date ON work_hours(date);
CREATE INDEX IF NOT EXISTS idx_work_hours_employee_date ON work_hours(employee_id, date);

-- Enable RLS
ALTER TABLE work_hours ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Employees can view their own work hours"
  ON work_hours
  FOR SELECT
  TO authenticated
  USING (auth.uid() = employee_id);

CREATE POLICY "Supervisors can view work hours for their centers"
  ON work_hours
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM supervisor_profiles sp
      JOIN employee_profiles ep ON ep.id = work_hours.employee_id
      WHERE sp.id = auth.uid()
        AND sp.is_active = true
        AND sp.supervisor_type = 'center'
        AND ep.work_centers && sp.work_centers
    )
  );