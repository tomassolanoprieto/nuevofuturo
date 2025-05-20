import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface Employee {
  id: string;
  fiscal_name: string;
  email: string;
  work_centers: string[];
  is_active: boolean;
}

interface TimeEntry {
  id: string;
  employee_id: string;
  entry_type: string;
  timestamp: string;
  time_type?: string;
  work_center?: string;
  is_active: boolean;
  changes?: string | null;
  original_timestamp?: string | null;
}

interface CompanyContextType {
  employees: Employee[];
  timeEntries: TimeEntry[];
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  refreshEmployeeData: (employeeId: string) => Promise<void>;
  calculateWorkTimeForToday: (employeeId: string) => number;
  calculateEmployeeWorkTime: (employeeId: string) => number;
  formatDuration: (ms: number) => string;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Función para obtener empleados
  const fetchEmployees = async (): Promise<Employee[]> => {
    try {
      const { data, error } = await supabase
        .from('employee_profiles')
        .select('*')
        .eq('is_active', true)
        .order('fiscal_name', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching employees:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar empleados');
      return [];
    }
  };

  // Función para obtener fichajes
  const fetchTimeEntries = async (): Promise<TimeEntry[]> => {
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('is_active', true)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching time entries:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar fichajes');
      return [];
    }
  };

  // Función para refrescar todos los datos
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [employeesData, timeEntriesData] = await Promise.all([
        fetchEmployees(),
        fetchTimeEntries()
      ]);

      setEmployees(employeesData);
      setTimeEntries(timeEntriesData);
    } catch (err) {
      console.error('Error in fetchData:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  // Función para refrescar datos de un empleado específico
  const refreshEmployeeData = async (employeeId: string) => {
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('is_active', true)
        .order('timestamp', { ascending: false });

      if (error) throw error;

      setTimeEntries(prev => [
        ...prev.filter(entry => entry.employee_id !== employeeId),
        ...(data || [])
      ]);
    } catch (err) {
      console.error('Error refreshing employee data:', err);
      setError(err instanceof Error ? err.message : 'Error al actualizar fichajes');
    }
  };

  // Cálculo del tiempo trabajado en un día específico
  const calculateDailyWorkTime = useCallback((entries: TimeEntry[]): number => {
    const sortedEntries = [...entries].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let totalTime = 0;
    let currentShift: { start: TimeEntry; end: TimeEntry | null; breaks: { start: TimeEntry; end: TimeEntry | null }[] } | null = null;
    const completedShifts: { start: TimeEntry; end: TimeEntry; breaks: { start: TimeEntry; end: TimeEntry }[] }[] = [];

    for (const entry of sortedEntries) {
      switch (entry.entry_type) {
        case 'clock_in':
          if (currentShift) {
            // Cerrar turno anterior al final del día
            const endOfDay = new Date(currentShift.start.timestamp);
            endOfDay.setHours(23, 59, 59, 999);
            completedShifts.push({
              start: currentShift.start,
              end: { ...currentShift.start, timestamp: endOfDay.toISOString() },
              breaks: currentShift.breaks.filter(b => b.end !== null) as { start: TimeEntry; end: TimeEntry }[]
            });
          }
          currentShift = {
            start: entry,
            end: null,
            breaks: []
          };
          break;

        case 'break_start':
          if (currentShift && !currentShift.breaks.some(b => !b.end)) {
            currentShift.breaks.push({ start: entry, end: null });
          }
          break;

        case 'break_end':
          if (currentShift?.breaks?.length > 0) {
            const lastBreak = currentShift.breaks[currentShift.breaks.length - 1];
            if (!lastBreak.end) {
              lastBreak.end = entry;
            }
          }
          break;

        case 'clock_out':
          if (currentShift) {
            currentShift.end = entry;
            completedShifts.push({
              start: currentShift.start,
              end: entry,
              breaks: currentShift.breaks.filter(b => b.end !== null) as { start: TimeEntry; end: TimeEntry }[]
            });
            currentShift = null;
          }
          break;
      }
    }

    // Si queda un turno sin cerrar, lo cerramos con la hora actual
    if (currentShift) {
      const now = new Date();
      completedShifts.push({
        start: currentShift.start,
        end: { ...currentShift.start, timestamp: now.toISOString() },
        breaks: currentShift.breaks.filter(b => b.end !== null) as { start: TimeEntry; end: TimeEntry }[]
      });
    }

    // Calcular tiempo total restando pausas
    for (const shift of completedShifts) {
      const startTime = new Date(shift.start.timestamp);
      const endTime = new Date(shift.end.timestamp);

      let shiftTime = 0;
      
      if (startTime.toDateString() === endTime.toDateString()) {
        shiftTime = endTime.getTime() - startTime.getTime();
      } else {
        // Turno nocturno (cruza días)
        const endOfFirstDay = new Date(startTime);
        endOfFirstDay.setHours(23, 59, 59, 999);
        shiftTime += endOfFirstDay.getTime() - startTime.getTime();
        
        const startOfLastDay = new Date(endTime);
        startOfLastDay.setHours(0, 0, 0, 0);
        shiftTime += endTime.getTime() - startOfLastDay.getTime();
        
        const daysBetween = Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24)) - 1;
        if (daysBetween > 0) {
          shiftTime += daysBetween * 24 * 60 * 60 * 1000;
        }
      }

      // Restar tiempo de pausas
      for (const brk of shift.breaks) {
        const breakStart = new Date(brk.start.timestamp);
        const breakEnd = new Date(brk.end.timestamp);
        
        if (breakStart.toDateString() === breakEnd.toDateString()) {
          shiftTime -= breakEnd.getTime() - breakStart.getTime();
        } else {
          // Pausa que cruza días (raro pero posible)
          const endOfBreakDay = new Date(breakStart);
          endOfBreakDay.setHours(23, 59, 59, 999);
          shiftTime -= endOfBreakDay.getTime() - breakStart.getTime();
          
          const startOfBreakNextDay = new Date(breakEnd);
          startOfBreakNextDay.setHours(0, 0, 0, 0);
          shiftTime -= breakEnd.getTime() - startOfBreakNextDay.getTime();
        }
      }

      totalTime += Math.max(0, shiftTime);
    }

    return totalTime;
  }, []);

  // Cálculo de horas trabajadas hoy
  const calculateWorkTimeForToday = useCallback((employeeId: string): number => {
    const today = new Date().toISOString().split('T')[0];
    const todayEntries = timeEntries.filter(entry => {
      return entry.employee_id === employeeId && 
             new Date(entry.timestamp).toISOString().split('T')[0] === today;
    });
    
    return calculateDailyWorkTime(todayEntries);
  }, [timeEntries, calculateDailyWorkTime]);

  // Cálculo de horas totales trabajadas por empleado
  const calculateEmployeeWorkTime = useCallback((employeeId: string): number => {
    const employeeEntries = timeEntries.filter(entry => 
      entry.employee_id === employeeId && entry.is_active
    );
    
    const entriesByDate = employeeEntries.reduce((acc: Record<string, TimeEntry[]>, entry) => {
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      if (!acc[date]) acc[date] = [];
      acc[date].push(entry);
      return acc;
    }, {});

    let totalTime = 0;
    Object.values(entriesByDate).forEach((dayEntries: TimeEntry[]) => {
      totalTime += calculateDailyWorkTime(dayEntries);
    });
    
    return totalTime;
  }, [timeEntries, calculateDailyWorkTime]);

  // Formatear duración a horas y minutos
  const formatDuration = useCallback((ms: number): string => {
    const totalHours = ms / (1000 * 60 * 60);
    const hours = Math.floor(totalHours);
    const minutes = Math.round((totalHours % 1) * 60);
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }, []);

  // Suscripción a cambios en tiempo real
  useEffect(() => {
    fetchData();

    const timeEntriesChannel = supabase.channel('time-entry-changes')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'time_entries',
          filter: 'is_active=eq.true'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTimeEntries(prev => [payload.new as TimeEntry, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setTimeEntries(prev => 
              prev.map(entry => 
                entry.id === payload.new.id ? payload.new as TimeEntry : entry
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setTimeEntries(prev => 
              prev.filter(entry => entry.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      timeEntriesChannel.unsubscribe();
    };
  }, []);

  return (
    <CompanyContext.Provider value={{ 
      employees, 
      timeEntries, 
      loading, 
      error, 
      refreshData: fetchData,
      refreshEmployeeData,
      calculateWorkTimeForToday,
      calculateEmployeeWorkTime,
      formatDuration
    }}>
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};