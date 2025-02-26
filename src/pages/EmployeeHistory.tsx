import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar } from 'lucide-react';

type TimeEntryType = 'turno' | 'coordinacion' | 'formacion' | 'sustitucion' | 'otros';

export default function EmployeeHistory() {
  const [entries, setEntries] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [totalTime, setTotalTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTimeEntries();
  }, [startDate, endDate]);

  const fetchTimeEntries = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get employee ID from localStorage
      const employeeId = localStorage.getItem('employeeId');
      if (!employeeId) {
        throw new Error('No se encontró el ID del empleado');
      }

      let query = supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', employeeId)
        .order('timestamp', { ascending: true });

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query = query.gte('timestamp', start.toISOString());
      }
      
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte('timestamp', end.toISOString());
      }

      const { data, error: entriesError } = await query;
      if (entriesError) throw entriesError;

      setEntries(data || []);
      calculateTotalTime(data);
    } catch (err) {
      console.error('Error fetching time entries:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar los fichajes');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalTime = (entries) => {
    let total = 0;
    let clockInTime = null;
    let breakStartTime = null;

    entries?.forEach((entry) => {
      const currentTime = new Date(entry.timestamp).getTime();

      switch (entry.entry_type) {
        case 'clock_in':
          clockInTime = currentTime;
          break;
        case 'break_start':
          if (clockInTime) {
            total += currentTime - clockInTime;
            clockInTime = null;
          }
          breakStartTime = currentTime;
          break;
        case 'break_end':
          clockInTime = currentTime;
          breakStartTime = null;
          break;
        case 'clock_out':
          if (clockInTime) {
            total += currentTime - clockInTime;
            clockInTime = null;
          }
          break;
      }
    });

    // If still clocked in, add time until now
    if (clockInTime) {
      total += new Date().getTime() - clockInTime;
    }

    setTotalTime(total);
  };

  const filterToday = () => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    setStartDate(dateStr);
    setEndDate(dateStr);
  };

  const filterWeek = () => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(monday.getDate() - monday.getDay() + (monday.getDay() === 0 ? -6 : 1));
    
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    
    setStartDate(monday.toISOString().split('T')[0]);
    setEndDate(sunday.toISOString().split('T')[0]);
  };

  const filterMonth = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(lastDay.toISOString().split('T')[0]);
  };

  const formatDuration = (ms) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const getEntryTypeText = (type) => {
    switch (type) {
      case 'clock_in': return 'Entrada';
      case 'break_start': return 'Inicio Pausa';
      case 'break_end': return 'Fin Pausa';
      case 'clock_out': return 'Salida';
      default: return type;
    }
  };

  const getTimeTypeText = (type: TimeEntryType | null) => {
    switch (type) {
      case 'turno': return 'Fichaje de turno';
      case 'coordinacion': return 'Fichaje de coordinación';
      case 'formacion': return 'Fichaje de formación';
      case 'sustitucion': return 'Fichaje de horas de sustitución';
      case 'otros': return 'Otros';
      default: return '';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-6">Historial de Fichajes</h2>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
            {error}
          </div>
        )}
        
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex gap-2">
            <button
              onClick={filterToday}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Hoy
            </button>
            <button
              onClick={filterWeek}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Semana
            </button>
            <button
              onClick={filterMonth}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Mes
            </button>
          </div>
          <div className="flex gap-4 ml-auto">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha Inicio
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha Fin
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border rounded-lg px-3 py-2"
              />
            </div>
          </div>
        </div>

        <div className="bg-blue-50 p-6 rounded-lg mb-6">
          <h3 className="text-xl font-semibold mb-2">Tiempo Total Trabajado</h3>
          <p className="text-3xl font-bold text-blue-600">{formatDuration(totalTime)}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hora
                </th>
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo de Fichaje
                </th>
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Centro de Trabajo
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center">
                    Cargando fichajes...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center">
                    No hay fichajes para mostrar
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getEntryTypeText(entry.entry_type)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {entry.entry_type === 'clock_in' ? getTimeTypeText(entry.time_type) : ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {entry.work_center || ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}