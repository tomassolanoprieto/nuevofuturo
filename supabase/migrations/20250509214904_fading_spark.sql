-- Check if policy exists before trying to create it
DO $$ 
BEGIN
    -- Drop existing policies for time_entries if they exist
    DROP POLICY IF EXISTS "time_entries_access_v10" ON time_entries;
    DROP POLICY IF EXISTS "time_entries_access_v8" ON time_entries;
    DROP POLICY IF EXISTS "time_entries_access_v7" ON time_entries;
    DROP POLICY IF EXISTS "time_entries_access_v6" ON time_entries;
    DROP POLICY IF EXISTS "time_entries_access_v5" ON time_entries;
    DROP POLICY IF EXISTS "time_entries_access_v4" ON time_entries;
    DROP POLICY IF EXISTS "time_entries_access_v3" ON time_entries;
    DROP POLICY IF EXISTS "time_entries_access" ON time_entries;
    DROP POLICY IF EXISTS "supervisor_center_time_entries_v5" ON time_entries;
    DROP POLICY IF EXISTS "supervisor_center_time_entries_v4" ON time_entries;
    DROP POLICY IF EXISTS "supervisor_center_time_entries_v3" ON time_entries;
    DROP POLICY IF EXISTS "supervisor_center_time_entries_v2" ON time_entries;
    DROP POLICY IF EXISTS "supervisor_center_time_entries" ON time_entries;
    DROP POLICY IF EXISTS "supervisor_time_entries_access_v3" ON time_entries;
    DROP POLICY IF EXISTS "supervisor_time_entries_access" ON time_entries;
    
    -- Check if the policy already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'time_entries' 
        AND policyname = 'time_entries_access_comprehensive'
    ) THEN
        -- Create comprehensive policy for time entries access
        CREATE POLICY "time_entries_access_comprehensive"
          ON time_entries
          FOR ALL
          TO authenticated
          USING (
            -- Employee can access their own entries
            employee_id = auth.uid() OR
            -- Company can access their employees' entries
            EXISTS (
              SELECT 1 FROM employee_profiles ep
              WHERE ep.id = time_entries.employee_id
              AND ep.company_id = auth.uid()
            ) OR
            -- Supervisor can access entries from their employees
            EXISTS (
              SELECT 1 FROM supervisor_profiles sp
              JOIN employee_profiles ep ON ep.id = time_entries.employee_id
              WHERE sp.id = auth.uid()
              AND sp.company_id = ep.company_id
              AND sp.is_active = true
              AND (
                (sp.supervisor_type = 'center' AND ep.work_centers && sp.work_centers) OR
                (sp.supervisor_type = 'delegation' AND ep.delegation = ANY(sp.delegations))
              )
            )
          )
          WITH CHECK (
            -- Employee can modify their own entries
            employee_id = auth.uid() OR
            -- Company can modify their employees' entries
            EXISTS (
              SELECT 1 FROM employee_profiles ep
              WHERE ep.id = time_entries.employee_id
              AND ep.company_id = auth.uid()
            ) OR
            -- Supervisor can modify entries from their employees
            EXISTS (
              SELECT 1 FROM supervisor_profiles sp
              JOIN employee_profiles ep ON ep.id = time_entries.employee_id
              WHERE sp.id = auth.uid()
              AND sp.company_id = ep.company_id
              AND sp.is_active = true
              AND (
                (sp.supervisor_type = 'center' AND ep.work_centers && sp.work_centers) OR
                (sp.supervisor_type = 'delegation' AND ep.delegation = ANY(sp.delegations))
              )
            )
          );
    ELSE
        -- If policy exists, drop and recreate it
        DROP POLICY "time_entries_access_comprehensive" ON time_entries;
        
        CREATE POLICY "time_entries_access_comprehensive"
          ON time_entries
          FOR ALL
          TO authenticated
          USING (
            -- Employee can access their own entries
            employee_id = auth.uid() OR
            -- Company can access their employees' entries
            EXISTS (
              SELECT 1 FROM employee_profiles ep
              WHERE ep.id = time_entries.employee_id
              AND ep.company_id = auth.uid()
            ) OR
            -- Supervisor can access entries from their employees
            EXISTS (
              SELECT 1 FROM supervisor_profiles sp
              JOIN employee_profiles ep ON ep.id = time_entries.employee_id
              WHERE sp.id = auth.uid()
              AND sp.company_id = ep.company_id
              AND sp.is_active = true
              AND (
                (sp.supervisor_type = 'center' AND ep.work_centers && sp.work_centers) OR
                (sp.supervisor_type = 'delegation' AND ep.delegation = ANY(sp.delegations))
              )
            )
          )
          WITH CHECK (
            -- Employee can modify their own entries
            employee_id = auth.uid() OR
            -- Company can modify their employees' entries
            EXISTS (
              SELECT 1 FROM employee_profiles ep
              WHERE ep.id = time_entries.employee_id
              AND ep.company_id = auth.uid()
            ) OR
            -- Supervisor can modify entries from their employees
            EXISTS (
              SELECT 1 FROM supervisor_profiles sp
              JOIN employee_profiles ep ON ep.id = time_entries.employee_id
              WHERE sp.id = auth.uid()
              AND sp.company_id = ep.company_id
              AND sp.is_active = true
              AND (
                (sp.supervisor_type = 'center' AND ep.work_centers && sp.work_centers) OR
                (sp.supervisor_type = 'delegation' AND ep.delegation = ANY(sp.delegations))
              )
            )
          );
    END IF;
END $$;

-- Create indexes for better performance if they don't exist
CREATE INDEX IF NOT EXISTS idx_time_entries_employee_id 
ON time_entries(employee_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_is_active 
ON time_entries(is_active);

CREATE INDEX IF NOT EXISTS idx_time_entries_timestamp 
ON time_entries(timestamp);