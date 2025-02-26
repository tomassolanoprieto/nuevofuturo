import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Employee {
  id: string;
  fiscal_name: string;
  email: string;
  work_centers: string[];
  is_active: boolean;
  document_type: string;
  document_number: string;
  created_at: string;
  job_positions: string[];
  employee_id: string;
  seniority_date: string;
  delegation: string;
}

interface TimeEntry {
  id: string;
  employee_id: string;
  entry_type: string;
  timestamp: string;
  time_type?: string;
  work_center?: string;
}

interface CompanyContextType {
  employees: Employee[];
  timeEntries: TimeEntry[];
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  useEffect(() => {
    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Only load data if there's a user authenticated
      if (!user) {
        setEmployees([]);
        setTimeEntries([]);
        return;
      }

      // Get employees for the company
      const { data: employeesData, error: employeesError } = await supabase
        .from('employee_profiles')
        .select('*')
        .eq('company_id', user.id)
        .eq('is_active', true)
        .order('fiscal_name', { ascending: true });

      if (employeesError) {
        console.error('Error fetching employees:', employeesError);
        throw new Error('Error al cargar los empleados');
      }

      setEmployees(employeesData || []);

      // Get time entries for all employees
      if (employeesData && employeesData.length > 0) {
        const employeeIds = employeesData.map(emp => emp.id);
        
        const { data: timeEntriesData, error: timeEntriesError } = await supabase
          .from('time_entries')
          .select('*')
          .in('employee_id', employeeIds)
          .order('timestamp', { ascending: false });

        if (timeEntriesError) {
          console.error('Error fetching time entries:', timeEntriesError);
          throw new Error('Error al cargar los fichajes');
        }

        setTimeEntries(timeEntriesData || []);
      } else {
        setTimeEntries([]);
      }

    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar los datos');
      
      // Retry logic
      if (retryCount < maxRetries) {
        console.log(`Retrying... Attempt ${retryCount + 1} of ${maxRetries}`);
        setRetryCount(prev => prev + 1);
        setTimeout(fetchData, 2000 * Math.pow(2, retryCount)); // Exponential backoff
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();

      // Set up realtime subscriptions
      const employeesChannel = supabase.channel('employee-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'employee_profiles'
          },
          () => {
            console.log('Employee changes detected, refreshing data...');
            fetchData();
          }
        )
        .subscribe();

      const timeEntriesChannel = supabase.channel('time-entry-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'time_entries'
          },
          () => {
            console.log('Time entry changes detected, refreshing data...');
            fetchData();
          }
        )
        .subscribe();

      // Cleanup subscriptions
      return () => {
        employeesChannel.unsubscribe();
        timeEntriesChannel.unsubscribe();
      };
    }
  }, [user]);

  const value = {
    employees,
    timeEntries,
    loading,
    error,
    refreshData: fetchData
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}