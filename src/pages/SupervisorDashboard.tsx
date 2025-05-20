import React, { useState, useEffect } from 'react';
import { useNavigate, Routes, Route } from 'react-router-dom';
import {
  LogOut,
  BarChart,
  Shield,
  User,
  Users,
  Clock,
  Search,
  X,
  Plus,
  Edit,
  Calendar,
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import SupervisorEmployees from './SupervisorEmployees';
import SupervisorRequests from './SupervisorRequests';
import SupervisorCalendar from './SupervisorCalendar';
import SupervisorReports from './SupervisorReports';

type TimeEntryType = 'turno' | 'coordinacion' | 'formacion' | 'sustitucion' | 'otros';

const workCenterOptions = [
  "MADRID HOGARES DE EMANCIPACION V. DEL PARDILLO",
  // ... resto de centros de trabajo ...
];

function Overview() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [newEntry, setNewEntry] = useState({
    timestamp: '',
    entry_type: 'clock_in',
    time_type: 'turno' as TimeEntryType,
    work_center: '',
  });
  const [supervisorWorkCenters, setSupervisorWorkCenters] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [entriesCurrentPage, setEntriesCurrentPage] = useState(0);
  const [entriesPerPage] = useState(10);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [loadingEntries, setLoadingEntries] = useState(false);

  const supervisorEmail = localStorage.getItem('supervisorEmail');

  useEffect(() => {
    const getSupervisorInfo = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!supervisorEmail) {
          throw new Error('No se encontró el correo electrónico del supervisor');
        }

        const { data: workCenters, error: workCentersError } = await supabase
          .rpc('get_supervisor_work_centers', {
            p_email: supervisorEmail,
          });

        if (workCentersError) {
          throw workCentersError;
        }

        if (!workCenters?.length) {
          throw new Error('No se encontraron centros de trabajo asignados');
        }

        setSupervisorWorkCenters(workCenters);

        const { data: employeesData, error: employeesError } = await supabase
          .rpc('get_supervisor_center_employees_v6', {
            p_email: supervisorEmail,
          });

        if (employeesError) {
          throw employeesError;
        }

        setEmployees(employeesData || []);
      } catch (err) {
        console.error('Error getting supervisor info:', err);
        setError(err instanceof Error ? err.message : 'Error al cargar los datos');
      } finally {
        setLoading(false);
      }
    };

    getSupervisorInfo();
  }, []);

  useEffect(() => {
    if (employees.length > 0) {
      fetchTimeEntries();
    }
  }, [employees]);

  const fetchTimeEntries = async () => {
    try {
      setError(null);
      const employeeIds = employees.map((emp) => emp.id);

      const { data: timeEntriesData, error } = await supabase
        .from('time_entries')
        .select('*')
        .in('employee_id', employeeIds)
        .eq('is_active', true)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setTimeEntries(timeEntriesData || []);
    } catch (err) {
      console.error('Error fetching time entries:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar los fichajes');
    }
  };

  const loadAllEmployeeEntries = async (employeeId: string) => {
    try {
      setLoadingEntries(true);
      let allEntries: any[] = [];
      let page = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('time_entries')
          .select('*')
          .eq('employee_id', employeeId)
          .eq('is_active', true)
          .order('timestamp', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allEntries = [...allEntries, ...data];
        page++;

        if (data.length < pageSize) break;
      }

      return allEntries;
    } catch (err) {
      console.error('Error loading employee entries:', err);
      throw err;
    } finally {
      setLoadingEntries(false);
    }
  };

  const formatDuration = (ms: number) => {
    const totalHours = ms / (1000 * 60 * 60);
    const hours = Math.floor(totalHours);
    const minutes = Math.round((totalHours % 1) * 60);
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  };

  const calculateWorkTimeForToday = (entries: any[]) => {
    const today = new Date().toISOString().split('T')[0];
    const todayEntries = entries.filter(entry => {
      const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
      return entryDate === today;
    });
    
    return calculateDailyWorkTime(todayEntries);
  };

  const calculateDailyWorkTime = (entries: any[]) => {
    const sortedEntries = [...entries].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let totalTime = 0;
    let currentShift: { start: any; end: any | null; breaks: any[] } | null = null;
    const completedShifts: { start: any; end: any; breaks: any[] }[] = [];

    for (const entry of sortedEntries) {
      const entryTime = new Date(entry.timestamp);

      switch (entry.entry_type) {
        case 'clock_in':
          if (currentShift) {
            const endOfDay = new Date(currentShift.start.timestamp);
            endOfDay.setHours(23, 59, 59, 999);
            completedShifts.push({
              start: currentShift.start,
              end: { ...currentShift.start, timestamp: endOfDay.toISOString() },
              breaks: currentShift.breaks
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
            completedShifts.push({ ...currentShift });
            currentShift = null;
          }
          break;
      }
    }

    if (currentShift) {
      const now = new Date();
      completedShifts.push({
        start: currentShift.start,
        end: { ...currentShift.start, timestamp: now.toISOString() },
        breaks: currentShift.breaks
      });
    }

    for (const shift of completedShifts) {
      const startTime = new Date(shift.start.timestamp);
      const endTime = new Date(shift.end.timestamp);

      let shiftTime = 0;
      
      if (startTime.toDateString() === endTime.toDateString()) {
        shiftTime = endTime.getTime() - startTime.getTime();
      } else {
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

      for (const brk of shift.breaks) {
        if (brk.start && brk.end) {
          const breakStart = new Date(brk.start.timestamp);
          const breakEnd = new Date(brk.end.timestamp);
          
          if (breakStart.toDateString() === breakEnd.toDateString()) {
            shiftTime -= breakEnd.getTime() - breakStart.getTime();
          } else {
            const endOfBreakDay = new Date(breakStart);
            endOfBreakDay.setHours(23, 59, 59, 999);
            shiftTime -= endOfBreakDay.getTime() - breakStart.getTime();
            
            const startOfBreakNextDay = new Date(breakEnd);
            startOfBreakNextDay.setHours(0, 0, 0, 0);
            shiftTime -= breakEnd.getTime() - startOfBreakNextDay.getTime();
          }
        }
      }

      totalTime += Math.max(0, shiftTime);
    }

    return totalTime;
  };

  const filterEntriesByMonth = (entries: any[]) => {
    if (!selectedMonth || selectedMonth === '') return entries;
    
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    
    return entries.filter(entry => {
      try {
        const entryDate = new Date(entry.timestamp);
        return entryDate >= startDate && entryDate <= endDate;
      } catch (e) {
        console.error('Error parsing date:', entry.timestamp, e);
        return false;
      }
    });
  };

  const getPaginatedEntries = () => {
    if (!selectedEmployee) return [];
    
    const filteredEntries = filterEntriesByMonth(selectedEmployee.entries);
    const startIndex = entriesCurrentPage * entriesPerPage;
    const endIndex = startIndex + entriesPerPage;
    
    return filteredEntries
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(startIndex, endIndex);
  };

  const getTotalEntriesPages = () => {
    if (!selectedEmployee) return 0;
    const filteredEntries = filterEntriesByMonth(selectedEmployee.entries);
    return Math.ceil(filteredEntries.length / entriesPerPage);
  };

  const calculateEmployeeWorkTime = (employeeEntries: any[]) => {
    const entriesByDate = employeeEntries.reduce((acc: any, entry) => {
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      if (!acc[date]) acc[date] = [];
      acc[date].push(entry);
      return acc;
    }, {});

    let totalTime = 0;
    Object.values(entriesByDate).forEach((dayEntries: any) => {
      totalTime += calculateDailyWorkTime(dayEntries);
    });
    return totalTime;
  };

  const refreshEmployeeData = async (employeeId: string) => {
    try {
      const entries = await loadAllEmployeeEntries(employeeId);
      setSelectedEmployee(prev => ({
        ...prev,
        entries: entries || [],
        totalTime: calculateEmployeeWorkTime(entries || [])
      }));
    } catch (err) {
      console.error('Error refreshing employee data:', err);
      setError('Error al actualizar los datos del empleado');
    }
  };

  const findOriginalEntry = async (employeeId: string, timestamp: string, currentEntryId: string) => {
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('entry_type', 'clock_in')
        .eq('is_active', true)
        .lt('timestamp', timestamp)
        .neq('id', currentEntryId)
        .order('timestamp', { ascending: false })
        .limit(1);

      if (error) throw error;
      return data?.[0] || null;
    } catch (err) {
      console.error('Error finding original entry:', err);
      return null;
    }
  };

  const handleAddEntry = async () => {
    try {
      const employeeId = selectedEmployee?.employee.id;
      const entryDate = new Date(newEntry.timestamp).toISOString();

      if (newEntry.entry_type !== 'clock_in') {
        const { data: activeEntries, error: fetchError } = await supabase
          .from('time_entries')
          .select('*')
          .eq('employee_id', employeeId)
          .eq('entry_type', 'clock_in')
          .eq('is_active', true)
          .lt('timestamp', entryDate)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (fetchError) throw fetchError;
        if (!activeEntries || activeEntries.length === 0) {
          throw new Error('Debe existir una entrada activa antes de registrar una salida o pausa');
        }
      }

      const { data: newEntryData, error } = await supabase
        .from('time_entries')
        .insert([{
          employee_id: employeeId,
          entry_type: newEntry.entry_type,
          time_type: newEntry.entry_type === 'clock_in' ? newEntry.time_type : null,
          timestamp: entryDate,
          changes: null,
          original_timestamp: null,
          is_active: true,
          work_center: newEntry.work_center,
        }])
        .select();

      if (error) throw error;

      if (newEntryData && newEntryData[0]) {
        await refreshEmployeeData(employeeId);
      }

      setShowEditModal(false);
      setNewEntry({
        timestamp: '',
        entry_type: 'clock_in',
        time_type: 'turno',
        work_center: selectedEmployee.employee.work_centers[0],
      });

    } catch (err) {
      console.error('Error adding entry:', err);
      setError(err instanceof Error ? err.message : 'Error al añadir el fichaje');
    }
  };

  const handleUpdateEntry = async () => {
    try {
      const employeeId = selectedEmployee?.employee.id;
      const newTimestamp = new Date(editingEntry?.timestamp).toISOString();

      if (editingEntry?.entry_type === 'clock_out') {
        const originalEntry = await findOriginalEntry(
          employeeId, 
          editingEntry.timestamp, 
          editingEntry.id
        );
        
        if (!originalEntry) {
          throw new Error('No se encontró la entrada original para esta salida');
        }

        if (new Date(newTimestamp) <= new Date(originalEntry.timestamp)) {
          throw new Error('La hora de salida debe ser posterior a la hora de entrada');
        }
      }

      const { data: updatedData, error } = await supabase
        .from('time_entries')
        .update({
          entry_type: editingEntry?.entry_type,
          time_type: editingEntry?.entry_type === 'clock_in' ? editingEntry.time_type : null,
          timestamp: newTimestamp,
          changes: 'edited',
          original_timestamp: editingEntry?.original_timestamp || editingEntry?.timestamp,
          work_center: editingEntry?.work_center,
          is_active: true
        })
        .eq('id', editingEntry?.id)
        .select();

      if (error) throw error;

      if (updatedData && updatedData[0]) {
        await refreshEmployeeData(employeeId);
      }

      setShowEditModal(false);
      setEditingEntry(null);

    } catch (err) {
      console.error('Error updating entry:', err);
      setError(err instanceof Error ? err.message : 'Error al actualizar el fichaje');
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este fichaje?')) return;

    try {
      const employeeId = selectedEmployee?.employee.id;
      
      const { data: updatedData, error } = await supabase
        .from('time_entries')
        .update({
          changes: 'eliminated',
          is_active: false
        })
        .eq('id', entryId)
        .select();

      if (error) throw error;

      if (updatedData && updatedData[0]) {
        await refreshEmployeeData(employeeId);
      }

    } catch (err) {
      console.error('Error deleting entry:', err);
      setError('Error al eliminar el fichaje');
    }
  };

  const getEntryTypeText = (type: string) => {
    switch (type) {
      case 'clock_in':
        return 'Entrada';
      case 'break_start':
        return 'Inicio Pausa';
      case 'break_end':
        return 'Fin Pausa';
      case 'clock_out':
        return 'Salida';
      default:
        return type;
    }
  };

  const getTimeTypeText = (type: TimeEntryType | null) => {
    switch (type) {
      case 'turno':
        return 'Fichaje de turno';
      case 'coordinacion':
        return 'Fichaje de coordinación';
      case 'formacion':
        return 'Fichaje de formación';
      case 'sustitucion':
        return 'Fichaje de horas de sustitución';
      case 'otros':
        return 'Otros';
      default:
        return '';
    }
  };

  const employeeWorkTimes = employees.map((employee) => {
    const employeeEntries = timeEntries.filter((entry) => entry.employee_id === employee.id && entry.is_active);
    return {
      employee,
      totalTime: calculateEmployeeWorkTime(employeeEntries),
      entries: employeeEntries,
    };
  });

  const totalWorkTime = employeeWorkTimes.reduce((acc, curr) => acc + curr.totalTime, 0);

  const filteredEmployees = employeeWorkTimes.filter(({ employee }) =>
    employee.fiscal_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (employee.work_centers &&
      employee.work_centers.some(
        (wc: any) => typeof wc === 'string' && wc.toLowerCase().includes(searchTerm.toLowerCase())
      ))
  );

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Vista General</h1>
          <p className="text-gray-600">Centros de Trabajo: {supervisorWorkCenters.join(', ')}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <div className="flex items-center gap-4">
              <Users className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Total Empleados</p>
                <p className="text-2xl font-bold">{employees.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <div className="flex items-center gap-4">
              <Clock className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Tiempo Total Trabajado</p>
                <p className="text-2xl font-bold">{formatDuration(totalWorkTime)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <div className="flex items-center gap-4">
              <Shield className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Centros de Trabajo</p>
                <p className="text-2xl font-bold">{supervisorWorkCenters.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Buscar empleados..."
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nombre
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Centros de Trabajo
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tiempo Trabajado
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center">
                      Cargando...
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center">
                      No hay empleados para mostrar
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map(({ employee, totalTime, entries }) => (
                    <tr
                      key={employee.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={async () => {
                        try {
                          const allEntries = await loadAllEmployeeEntries(employee.id);
                          setSelectedEmployee({
                            employee,
                            totalTime: calculateEmployeeWorkTime(allEntries),
                            entries: allEntries
                          });
                          setShowDetailsModal(true);
                          setEntriesCurrentPage(0);
                        } catch (err) {
                          setError('Error al cargar los fichajes del empleado');
                        }
                      }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {employee.fiscal_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {employee.email}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {Array.isArray(employee.work_centers) ? employee.work_centers.join(', ') : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">
                          {formatDuration(totalTime)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showDetailsModal && selectedEmployee && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">
                    Detalles de Fichajes - {selectedEmployee.employee.fiscal_name}
                  </h2>
                  <button
                    onClick={() => setShowDetailsModal(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="p-6 bg-blue-50 border-b border-blue-200">
                <div className="flex items-center gap-4">
                  <Clock className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="text-sm text-gray-600">Horas trabajadas hoy</p>
                    <p className="text-xl font-bold">
                      {formatDuration(calculateWorkTimeForToday(selectedEmployee.entries))}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="font-medium">{selectedEmployee.employee.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Centros de Trabajo</p>
                      <p className="font-medium">
                        {Array.isArray(selectedEmployee.employee.work_centers)
                          ? selectedEmployee.employee.work_centers.join(', ')
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium">Registro de Fichajes</h3>
                      <button
                        onClick={() => {
                          setNewEntry({
                            timestamp: new Date().toISOString().slice(0, 16),
                            entry_type: 'clock_in',
                            time_type: 'turno',
                            work_center: selectedEmployee.employee.work_centers[0],
                          });
                          setEditingEntry(null);
                          setShowEditModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Añadir Fichaje
                      </button>
                    </div>

                    <div className="mb-4 flex items-center gap-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Filtrar por mes
                      </label>
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => {
                          setSelectedMonth(e.target.value);
                          setEntriesCurrentPage(0);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        onClick={() => {
                          setSelectedMonth('');
                          setEntriesCurrentPage(0);
                        }}
                        className="px-3 py-2 text-sm text-blue-600 hover:text-blue-800"
                      >
                        Mostrar todos
                      </button>
                    </div>
                    
                    <div className="bg-gray-50 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead>
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Fecha
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Hora
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Tipo
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Tipo de Fichaje
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Centro de Trabajo
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Cambios
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Acciones
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {loadingEntries ? (
                              <tr>
                                <td colSpan={7} className="px-6 py-4 text-center">
                                  Cargando fichajes...
                                </td>
                              </tr>
                            ) : getPaginatedEntries().length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-6 py-4 text-center">
                                  No hay fichajes para mostrar
                                </td>
                              </tr>
                            ) : (
                              getPaginatedEntries().map((entry) => (
                                <tr key={entry.id} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {new Date(entry.timestamp).toLocaleDateString()}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {new Date(entry.timestamp).toLocaleTimeString()}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {getEntryTypeText(entry.entry_type)}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {entry.entry_type === 'clock_in' ? getTimeTypeText(entry.time_type) : ''}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {entry.work_center || ''}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {entry.changes || 'N/A'}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    <div className="flex gap-2">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingEntry({
                                            id: entry.id,
                                            timestamp: new Date(entry.timestamp).toISOString().slice(0, 16),
                                            entry_type: entry.entry_type,
                                            time_type: entry.time_type,
                                            work_center: entry.work_center,
                                            original_timestamp: entry.original_timestamp,
                                          });
                                          setShowEditModal(true);
                                        }}
                                        className="p-1 text-blue-600 hover:text-blue-800"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteEntry(entry.id);
                                        }}
                                        className="p-1 text-red-600 hover:text-red-800"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-4">
                      <button
                        onClick={() => setEntriesCurrentPage(prev => Math.max(prev - 1, 0))}
                        disabled={entriesCurrentPage === 0}
                        className={`flex items-center gap-1 px-3 py-1 rounded-md ${
                          entriesCurrentPage === 0 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <ChevronLeft className="w-5 h-5" />
                        Anterior
                      </button>
                      
                      <span className="text-sm text-gray-600">
                        Página {entriesCurrentPage + 1} de {getTotalEntriesPages()}
                      </span>
                      
                      <button
                        onClick={() => setEntriesCurrentPage(prev => prev + 1)}
                        disabled={(entriesCurrentPage + 1) >= getTotalEntriesPages()}
                        className={`flex items-center gap-1 px-3 py-1 rounded-md ${
                          (entriesCurrentPage + 1) >= getTotalEntriesPages() 
                            ? 'text-gray-400 cursor-not-allowed' 
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        Siguiente
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-gray-200">
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowDetailsModal(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showEditModal && selectedEmployee && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">
                    {editingEntry ? 'Editar Fichaje' : 'Añadir Fichaje'}
                  </h2>
                  <button
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingEntry(null);
                      setNewEntry({
                        timestamp: '',
                        entry_type: 'clock_in',
                        time_type: 'turno',
                        work_center: selectedEmployee.employee.work_centers[0],
                      });
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              <div className="p-6">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      if (editingEntry) {
                        if (editingEntry.entry_type === 'clock_out') {
                          const newTimestamp = new Date(editingEntry.timestamp);
                          const originalEntry = await findOriginalEntry(
                            selectedEmployee.employee.id, 
                            editingEntry.timestamp,
                            editingEntry.id
                          );

                          if (!originalEntry) {
                            throw new Error('No se encontró la entrada original para esta salida');
                          }

                          if (newTimestamp <= new Date(originalEntry.timestamp)) {
                            throw new Error('La hora de salida debe ser posterior a la hora de entrada');
                          }
                        }
                        await handleUpdateEntry();
                      } else {
                        await handleAddEntry();
                      }
                    } catch (err: any) {
                      alert(err.message || 'Error al procesar el fichaje');
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha y Hora
                    </label>
                    <input
                      type="datetime-local"
                      value={editingEntry ? editingEntry.timestamp : newEntry.timestamp}
                      onChange={(e) => {
                        if (editingEntry) {
                          setEditingEntry({ ...editingEntry, timestamp: e.target.value });
                        } else {
                          setNewEntry({ ...newEntry, timestamp: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo de Fichaje
                    </label>
                    <select
                      value={editingEntry ? editingEntry.entry_type : newEntry.entry_type}
                      onChange={(e) => {
                        if (editingEntry) {
                          setEditingEntry({ ...editingEntry, entry_type: e.target.value });
                        } else {
                          setNewEntry({ ...newEntry, entry_type: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      <option value="clock_in">Entrada</option>
                      <option value="break_start">Inicio Pausa</option>
                      <option value="break_end">Fin Pausa</option>
                      <option value="clock_out">Salida</option>
                    </select>
                  </div>

                  {(editingEntry?.entry_type === 'clock_in' || newEntry.entry_type === 'clock_in') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tipo de Entrada
                      </label>
                      <select
                        value={editingEntry ? editingEntry.time_type : newEntry.time_type}
                        onChange={(e) => {
                          if (editingEntry) {
                            setEditingEntry({
                              ...editingEntry,
                              time_type: e.target.value as TimeEntryType,
                            });
                          } else {
                            setNewEntry({
                              ...newEntry,
                              time_type: e.target.value as TimeEntryType,
                            });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="turno">Fichaje de turno</option>
                        <option value="coordinacion">Fichaje de coordinación</option>
                        <option value="formacion">Fichaje de formación</option>
                        <option value="sustitucion">Fichaje de horas de sustitución</option>
                        <option value="otros">Otros</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Centro de Trabajo
                    </label>
                    <select
                      value={editingEntry ? editingEntry.work_center : newEntry.work_center}
                      onChange={(e) => {
                        if (editingEntry) {
                          setEditingEntry({ ...editingEntry, work_center: e.target.value });
                        } else {
                          setNewEntry({ ...newEntry, work_center: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      {selectedEmployee.employee.work_centers.map((center: string) => (
                        <option key={center} value={center}>
                          {center}
                        </option>
                      ))}
                    </select>
                  </div>

                  {editingEntry?.entry_type === 'clock_out' && (
                    <div className="bg-yellow-50 p-3 rounded-lg text-yellow-800 text-sm">
                      <p>⚠️ Asegúrate de que la hora de salida sea posterior a la entrada correspondiente.</p>
                      <p>Puedes registrar la salida al día siguiente si es un turno nocturno.</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-4 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingEntry(null);
                        setNewEntry({
                          timestamp: '',
                          entry_type: 'clock_in',
                          time_type: 'turno',
                          work_center: selectedEmployee.employee.work_centers[0],
                        });
                      }}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      {editingEntry ? 'Guardar Cambios' : 'Añadir Fichaje'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SupervisorDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center">
                <Shield className="h-8 w-8 text-purple-600 mr-2" />
                <span className="text-xl font-bold text-gray-900">Portal Supervisor Centro</span>
              </div>
              <button
                onClick={() => {
                  setActiveTab('overview');
                  navigate('/supervisor/centro');
                }}
                className={`text-gray-900 hover:text-gray-700 px-3 py-2 font-medium ${
                  activeTab === 'overview' ? 'text-purple-600' : ''
                }`}
              >
                Vista General
              </button>
              <button
                onClick={() => {
                  setActiveTab('employees');
                  navigate('/supervisor/centro/empleados');
                }}
                className={`text-gray-900 hover:text-gray-700 px-3 py-2 font-medium ${
                  activeTab === 'employees' ? 'text-purple-600' : ''
                }`}
              >
                Empleados
              </button>
              <button
                onClick={() => {
                  setActiveTab('requests');
                  navigate('/supervisor/centro/solicitudes');
                }}
                className={`text-gray-900 hover:text-gray-700 px-3 py-2 font-medium ${
                  activeTab === 'requests' ? 'text-purple-600' : ''
                }`}
              >
                Solicitudes
              </button>
              <button
                onClick={() => {
                  setActiveTab('reports');
                  navigate('/supervisor/centro/informes');
                }}
                className={`text-gray-900 hover:text-gray-700 px-3 py-2 font-medium ${
                  activeTab === 'reports' ? 'text-purple-600' : ''
                }`}
              >
                Informes
              </button>
              <button
                onClick={() => {
                  setActiveTab('calendar');
                  navigate('/supervisor/centro/calendario');
                }}
                className={`text-gray-900 hover:text-gray-700 px-3 py-2 font-medium ${
                  activeTab === 'calendar' ? 'text-purple-600' : ''
                }`}
              >
                Calendario
              </button>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/login/supervisor/centro')}
                className="flex items-center text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors duration-200"
              >
                <LogOut className="h-5 w-5 mr-2" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/empleados" element={<SupervisorEmployees />} />
        <Route path="/solicitudes" element={<SupervisorRequests />} />
        <Route path="/informes" element={<SupervisorReports />} />
        <Route path="/calendario" element={<SupervisorCalendar />} />
      </Routes>
    </div>
  );
}