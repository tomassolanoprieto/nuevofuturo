-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS validate_supervisor_credentials(TEXT, TEXT);
DROP FUNCTION IF EXISTS get_delegation_employees(TEXT);

-- Create function to validate supervisor delegation credentials
CREATE OR REPLACE FUNCTION validate_supervisor_delegation_credentials(
  p_email TEXT,
  p_pin TEXT
)
RETURNS delegation_enum AS $$
BEGIN
  -- Map hardcoded credentials to delegations
  RETURN CASE
    WHEN p_email = 'delegacion_cordoba@nuevofuturo.com' AND p_pin = '285975' THEN 'CORDOBA'
    WHEN p_email = 'delegacion_palencia@nuevofuturo.com' AND p_pin = '780763' THEN 'PALENCIA'
    WHEN p_email = 'delegacion_cadiz@nuevofuturo.com' AND p_pin = '573572' THEN 'CADIZ'
    WHEN p_email = 'delegacion_alicante@nuevofuturo.com' AND p_pin = '631180' THEN 'ALICANTE'
    WHEN p_email = 'delegacion_burgos@nuevofuturo.com' AND p_pin = '520499' THEN 'BURGOS'
    WHEN p_email = 'delegacion_murcia@nuevofuturo.com' AND p_pin = '942489' THEN 'MURCIA'
    WHEN p_email = 'delegacion_valladolid@nuevofuturo.com' AND p_pin = '931909' THEN 'VALLADOLID'
    WHEN p_email = 'delegacion_sevilla@nuevofuturo.com' AND p_pin = '129198' THEN 'SEVILLA'
    WHEN p_email = 'delegacion_santander@nuevofuturo.com' AND p_pin = '280062' THEN 'SANTANDER'
    WHEN p_email = 'delegacion_madrid@nuevofuturo.com' AND p_pin = '228738' THEN 'MADRID'
    WHEN p_email = 'delegacion_concepcion@nuevofuturo.com' AND p_pin = '670959' THEN 'CONCEPCION_LA'
    WHEN p_email = 'delegacion_alava@nuevofuturo.com' AND p_pin = '768381' THEN 'ALAVA'
    ELSE NULL
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get employees by delegation
CREATE OR REPLACE FUNCTION get_delegation_employees(
  p_delegation delegation_enum
)
RETURNS TABLE (
  id UUID,
  fiscal_name TEXT,
  email TEXT,
  work_centers work_center_enum[],
  delegation delegation_enum,
  document_type TEXT,
  document_number TEXT,
  job_positions job_position_enum[],
  employee_id TEXT,
  seniority_date DATE,
  is_active BOOLEAN,
  company_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ep.id,
    ep.fiscal_name,
    ep.email,
    ep.work_centers,
    ep.delegation,
    ep.document_type,
    ep.document_number,
    ep.job_positions,
    ep.employee_id,
    ep.seniority_date,
    ep.is_active,
    ep.company_id
  FROM employee_profiles ep
  WHERE ep.delegation = p_delegation
  AND ep.is_active = true
  ORDER BY ep.fiscal_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_employee_profiles_delegation 
ON employee_profiles(delegation);

CREATE INDEX IF NOT EXISTS idx_employee_profiles_is_active 
ON employee_profiles(is_active);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION validate_supervisor_delegation_credentials TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_delegation_employees TO PUBLIC;