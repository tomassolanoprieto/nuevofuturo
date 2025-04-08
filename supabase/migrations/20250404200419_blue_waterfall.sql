/*
  # Create work center to delegation mapping

  1. New Tables
    - `work_center_delegation_mapping`: Maps work centers to delegations
      - `id` (serial, primary key)
      - `work_center` (work_center_enum, unique)
      - `delegation` (delegation_enum, not null)
  
  2. Data
    - Initial mapping for MADRID work centers
    - Function to get delegation from work center
    - Function to get work centers for a delegation
  
  3. Triggers
    - Function to automatically set delegation based on work center
*/

-- First create the mapping table
DROP TABLE IF EXISTS work_center_delegation_mapping;
CREATE TABLE work_center_delegation_mapping (
  id SERIAL PRIMARY KEY,
  work_center work_center_enum UNIQUE NOT NULL,
  delegation delegation_enum NOT NULL
);

-- Insert mappings for MADRID work centers
INSERT INTO work_center_delegation_mapping (work_center, delegation)
VALUES
  ('MADRID HOGARES DE EMANCIPACION V. DEL PARDILLO', 'MADRID'),
  ('MADRID CUEVAS DE ALMANZORA', 'MADRID'),
  ('MADRID OFICINA', 'MADRID'),
  ('MADRID ALCOBENDAS', 'MADRID'),
  ('MADRID MIGUEL HERNANDEZ', 'MADRID'),
  ('MADRID HUMANITARIAS', 'MADRID'),
  ('MADRID VALDEBERNARDO', 'MADRID'),
  ('MADRID JOSE DE PASAMONTE', 'MADRID'),
  ('MADRID IBIZA', 'MADRID'),
  ('MADRID PASEO EXTREMADURA', 'MADRID'),
  ('MADRID GABRIEL USERA', 'MADRID'),
  ('MADRID ARROYO DE LAS PILILLAS', 'MADRID'),
  ('MADRID CENTRO DE DIA CARMEN HERRERO', 'MADRID'),
  ('MADRID HOGARES DE EMANCIPACION SANTA CLARA', 'MADRID'),
  ('MADRID HOGARES DE EMANCIPACION BOCANGEL', 'MADRID'),
  ('MADRID AVDA DE AMERICA', 'MADRID'),
  ('MADRID VIRGEN DEL PUIG', 'MADRID'),
  ('MADRID ALMACEN', 'MADRID'),
  ('MADRID HOGARES DE EMANCIPACION ROQUETAS', 'MADRID'),
  ('MADRID DIRECTORES DE CENTRO', 'MADRID'),
  ('MADRID INTERVENCION EDUCATIVA', 'MADRID')
ON CONFLICT (work_center) DO UPDATE
SET delegation = EXCLUDED.delegation;

-- Create function to get delegation for a work center
CREATE OR REPLACE FUNCTION get_work_center_delegation(p_work_center work_center_enum)
RETURNS delegation_enum AS $$
  SELECT delegation 
  FROM work_center_delegation_mapping 
  WHERE work_center = p_work_center;
$$ LANGUAGE sql STABLE;

-- Create function to get work centers for a delegation
CREATE OR REPLACE FUNCTION get_delegation_work_centers(p_delegation delegation_enum)
RETURNS SETOF work_center_enum AS $$
  SELECT work_center 
  FROM work_center_delegation_mapping 
  WHERE delegation = p_delegation
  ORDER BY work_center;
$$ LANGUAGE sql STABLE;

-- Create function to automatically set delegation based on work centers
CREATE OR REPLACE FUNCTION set_delegation_from_work_centers()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update delegation if work_centers has values
  IF array_length(NEW.work_centers, 1) > 0 THEN
    -- Get delegation from the first work center
    SELECT delegation INTO NEW.delegation
    FROM work_center_delegation_mapping
    WHERE work_center = NEW.work_centers[1];
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set delegation
DROP TRIGGER IF EXISTS set_delegation_trigger ON employee_profiles;
CREATE TRIGGER set_delegation_trigger
  BEFORE INSERT OR UPDATE OF work_centers ON employee_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_delegation_from_work_centers();

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_work_center_delegation_mapping_delegation 
ON work_center_delegation_mapping(delegation);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_work_center_delegation TO authenticated;
GRANT EXECUTE ON FUNCTION get_delegation_work_centers TO authenticated;