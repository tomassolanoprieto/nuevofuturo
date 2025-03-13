import React, { useState, useEffect } from 'react';
import { useNavigate, Routes, Route } from 'react-router-dom';
import {
  LogOut,
  BarChart,
  FileText,
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
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCompany } from '../context/CompanyContext';
import CompanyEmployees from './CompanyEmployees';
import CompanySettings from './CompanySettings';
import CompanyRequests from './CompanyRequests';
import CompanyCalendar from './CompanyCalendar';
import CompanyReports from './CompanyReports';
import InspectorCredentials from './CompanyInspector'; // Nuevo componente

type TimeEntryType = 'turno' | 'coordinacion' | 'formacion' | 'sustitucion' | 'otros';

function Overview() {
  const { employees, timeEntries, loading } = useCompany();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [newEntry, setNewEntry] = useState({
    timestamp: '',
    entry_type: 'clock_in',
    time_type: 'turno' as TimeEntryType,
  });

  // Función para formatear la duración
  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Función para calcular las horas trabajadas en el día
  const calculateDailyWorkTime = (entries: any[]) => {
    const today = new Date().toLocaleDateString();
    const todayEntries = entries.filter(
      (entry) => new Date(entry.timestamp).toLocaleDateString() === today
    );

    let totalTime = 0;
    let clockInTime: number | null = null;
    let breakStartTime: number | null = null;

    todayEntries
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach((entry) => {
        const time = new Date(entry.timestamp).getTime();

        switch (entry.entry_type) {
          case 'clock_in':
            clockInTime = time;
            break;
          case 'break_start':
            if (clockInTime) {
              totalTime += time - clockInTime;
              clockInTime = null;
            }
            breakStartTime = time;
            break;
          case 'break_end':
            breakStartTime = null;
            clockInTime = time;
            break;
          case 'clock_out':
            if (clockInTime) {
              totalTime += time - clockInTime;
              clockInTime = null;
            }
            break;
        }
      });

    // Si hay una entrada de reloj sin salida (todavía trabajando)
    if (clockInTime && !breakStartTime) {
      const now = new Date().getTime();
      totalTime += now - clockInTime;
    }

    return totalTime;
  };

  // Calcular el tiempo total trabajado para cada empleado
  const employeeWorkTimes = employees.map((employee) => {
    const employeeEntries = timeEntries.filter((entry) => entry.employee_id === employee.id && entry.is_active);

    // Agrupar entradas por fecha
    const entriesByDate = employeeEntries.reduce((acc: any, entry) => {
      const date = new Date(entry.timestamp).toLocaleDateString();
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(entry);
      return acc;
    }, {});

    let totalTime = 0;

    // Calcular el tiempo para cada día
    Object.values(entriesByDate).forEach((dayEntries: any) => {
      const sortedEntries = dayEntries.sort(
        (a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      let clockInTime: number | null = null;
      let breakStartTime: number | null = null;

      sortedEntries.forEach((entry: any) => {
        const time = new Date(entry.timestamp).getTime();

        switch (entry.entry_type) {
          case 'clock_in':
            clockInTime = time;
            break;
          case 'break_start':
            if (clockInTime) {
              totalTime += time - clockInTime;
              clockInTime = null;
            }
            breakStartTime = time;
            break;
          case 'break_end':
            breakStartTime = null;
            clockInTime = time;
            break;
          case 'clock_out':
            if (clockInTime) {
              totalTime += time - clockInTime;
              clockInTime = null;
            }
            break;
        }
      });

      // Si hay una entrada de reloj sin salida (todavía trabajando)
      if (clockInTime && !breakStartTime) {
        const now = new Date().getTime();
        totalTime += now - clockInTime;
      }
    });

    return {
      employee,
      totalTime,
      entries: employeeEntries,
    };
  });

  const handleAddEntry = async () => {
  try {
    const employeeId = selectedEmployee.employee.id;
    const entryDate = new Date(newEntry.timestamp).toISOString().split('T')[0]; // Obtener la fecha (YYYY-MM-DD)

    // Validar solo si el tipo de fichaje es salida, inicio de pausa o fin de pausa
    if (newEntry.entry_type !== 'clock_in') {
      const { data: activeEntries, error: fetchError } = await supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('entry_type', 'clock_in')
        .eq('is_active', true)
        .gte('timestamp', `${entryDate}T00:00:00`)
        .lte('timestamp', `${entryDate}T23:59:59`)
        .order('timestamp', { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      if (!activeEntries || activeEntries.length === 0) {
        throw new Error('Debe existir una entrada activa antes de registrar una salida o pausa.');
      }
    }

    // Insertar el nuevo fichaje
    const { error } = await supabase.from('time_entries').insert([
      {
        employee_id: employeeId,
        entry_type: newEntry.entry_type,
        time_type: newEntry.entry_type === 'clock_in' ? newEntry.time_type : null,
        timestamp: new Date(newEntry.timestamp).toISOString(),
        changes: null,
        original_timestamp: null,
        is_active: true,
        work_center: newEntry.work_center, // Incluir el centro de trabajo
      },
    ]);

    if (error) throw error;

    // Recargar la página para actualizar los datos
    window.location.reload();
  } catch (err: any) {
    console.error('Error adding entry:', err);
    alert(err.message || 'Error al añadir el fichaje');
  }
};

  const handleUpdateEntry = async () => {
  try {
    const employeeId = selectedEmployee.employee.id;
    const entryDate = new Date(editingEntry.timestamp).toISOString().split('T')[0]; // Obtener la fecha (YYYY-MM-DD)

    // Validar solo si el tipo de fichaje es salida, inicio de pausa o fin de pausa
    if (editingEntry.entry_type !== 'clock_in') {
      const { data: activeEntries, error: fetchError } = await supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('entry_type', 'clock_in')
        .eq('is_active', true)
        .gte('timestamp', `${entryDate}T00:00:00`)
        .lte('timestamp', `${entryDate}T23:59:59`)
        .order('timestamp', { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      if (!activeEntries || activeEntries.length === 0) {
        throw new Error('Debe existir una entrada activa antes de registrar una salida o pausa.');
      }
    }

    // Actualizar el fichaje
    const { error } = await supabase
      .from('time_entries')
      .update({
        entry_type: editingEntry.entry_type,
        time_type: editingEntry.entry_type === 'clock_in' ? editingEntry.time_type : null,
        timestamp: new Date(editingEntry.timestamp).toISOString(),
        changes: 'edited',
        original_timestamp: editingEntry.original_timestamp || editingEntry.timestamp,
        work_center: editingEntry.work_center, // Incluir el centro de trabajo
      })
      .eq('id', editingEntry.id);

    if (error) throw error;

    // Recargar la página para actualizar los datos
    window.location.reload();
  } catch (err: any) {
    console.error('Error updating entry:', err);
    alert(err.message || 'Error al actualizar el fichaje');
  }
};

  const handleDeleteEntry = async (entryId: string) => {
  if (!confirm('¿Estás seguro de que quieres eliminar este fichaje?')) return;

  try {
    // Marcar el fichaje como eliminado (desactivarlo)
    const { error } = await supabase
      .from('time_entries')
      .update({
        changes: 'eliminated',
        is_active: false,
      })
      .eq('id', entryId);

    if (error) throw error;

    // Recargar la página para actualizar los datos
    window.location.reload();
  } catch (err) {
    console.error('Error deleting entry:', err);
    alert('Error al eliminar el fichaje');
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

  const totalWorkTime = employeeWorkTimes.reduce((acc, curr) => acc + curr.totalTime, 0);

  // Filtrar empleados basados en el término de búsqueda
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
          <p className="text-gray-600">Gestiona los horarios de trabajo de forma precisa y eficiente</p>
        </div>

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
                <p className="text-2xl font-bold">
                  {new Set(employees.flatMap((emp) => emp.work_centers || [])).size}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Buscador */}
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

        {/* Lista de Empleados */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
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
                    onClick={() => {
                      setSelectedEmployee({ employee, totalTime, entries });
                      setShowDetailsModal(true);
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

        {/* Modal de Detalles */}
        {showDetailsModal && selectedEmployee && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-6xl w-full max-h-[80vh] overflow-hidden">
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

              {/* Nuevo recuadro de horas trabajadas en el día */}
              <div className="p-6 bg-blue-50 border-b border-blue-200">
                <div className="flex items-center gap-4">
                  <Clock className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="text-sm text-gray-600">Horas trabajadas hoy</p>
                    <p className="text-xl font-bold">
                      {formatDuration(calculateDailyWorkTime(selectedEmployee.entries))}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 overflow-y-auto" style={{ maxHeight: '60vh' }}>
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
                        onClick={() => setShowEditModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Añadir Fichaje
                      </button>
                    </div>
                    <div className="bg-gray-50 rounded-lg overflow-hidden">
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
                          {selectedEmployee.entries
                            .sort(
                              (a: any, b: any) =>
                                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                            )
                            .map((entry: any) => (
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
                            ))}
                        </tbody>
                      </table>
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

        {/* Modal de Edición/Añadir */}
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
                work_center: selectedEmployee.employee.work_centers[0], // Incluir el centro de trabajo por defecto
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
          onSubmit={(e) => {
            e.preventDefault();
            if (editingEntry) {
              handleUpdateEntry();
            } else {
              handleAddEntry();
            }
          }}
          className="space-y-4"
        >
          {/* Campo: Fecha y Hora */}
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

          {/* Campo: Tipo de Fichaje */}
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

          {/* Campo: Tipo de Entrada (solo para ENTRADA) */}
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

          {/* Campo: Centro de Trabajo (siempre visible) */}
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

          {/* Botones del Formulario */}
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
                  work_center: selectedEmployee.employee.work_centers[0], // Incluir el centro de trabajo por defecto
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

export default function CompanyDashboard() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0); // Estado para contar solicitudes pendientes
  const navigate = useNavigate();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email || null);
    };
    getUser();
  }, []);

  useEffect(() => {
    const fetchPendingRequests = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Supongamos que la columna correcta es `employee_id` o alguna otra columna que relacione las solicitudes con la empresa
      const { data: requests, error } = await supabase
        .from('time_requests')
        .select('*')
        .eq('status', 'pending')
        .eq('employee_id', user.id); // Cambiar `company_id` por la columna correcta

      if (error) {
        console.error('Error fetching pending requests:', error);
        return;
      }

      setPendingRequestsCount(requests.length);
    };

    fetchPendingRequests();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login/empresa');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <Shield className="w-8 h-8 text-blue-600" />
            <span className="text-xl font-bold">Portal Empresa</span>
          </div>
          <nav className="space-y-2">
            <button
              onClick={() => {
                setActiveTab('overview');
                navigate('/empresa');
              }}
              className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg ${
                activeTab === 'overview' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <BarChart className="w-5 h-5" />
              Vista General
            </button>
            <button
              onClick={() => {
                setActiveTab('employees');
                navigate('/empresa/empleados');
              }}
              className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg ${
                activeTab === 'employees' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Users className="w-5 h-5" />
              Empleados
            </button>
            <button
              onClick={() => {
                setActiveTab('requests');
                navigate('/empresa/solicitudes');
              }}
              className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg ${
                activeTab === 'requests' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <FileText className="w-5 h-5" />
              Solicitudes
              {pendingRequestsCount > 0 && (
                <span className="bg-red-500 text-white rounded-full px-2 py-1 text-xs">
                  {pendingRequestsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setActiveTab('calendar');
                navigate('/empresa/calendario');
              }}
              className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg ${
                activeTab === 'calendar' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Calendar className="w-5 h-5" />
              Calendario
            </button>
            <button
              onClick={() => {
                setActiveTab('reports');
                navigate('/empresa/informes');
              }}
              className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg ${
                activeTab === 'reports' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <FileText className="w-5 h-5" />
              Informes
            </button>
            <button
              onClick={() => {
                setActiveTab('inspector');
                navigate('/empresa/inspector');
              }}
              className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg ${
                activeTab === 'inspector' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Shield className="w-5 h-5" />
              Inspector
            </button>
            <button
              onClick={() => {
                setActiveTab('settings');
                navigate('/empresa/ajustes');
              }}
              className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg ${
                activeTab === 'settings' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Settings className="w-5 h-5" />
              Configuración
            </button>
          </nav>
        </div>
        <div className="absolute bottom-0 w-64 p-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            <LogOut className="w-5 h-5" />
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/empleados" element={<CompanyEmployees />} />
          <Route path="/solicitudes" element={<CompanyRequests />} />
          <Route path="/calendario" element={<CompanyCalendar />} />
          <Route path="/informes" element={<CompanyReports />} />
          <Route path="/inspector" element={<InspectorCredentials />} /> {/* Nuevo apartado */}
          <Route path="/ajustes" element={<CompanySettings />} />
        </Routes>
      </div>
    </div>
  );
}