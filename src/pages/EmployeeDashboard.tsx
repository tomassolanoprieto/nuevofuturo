import React, { useState, useEffect } from 'react';
import { useNavigate, Routes, Route, Link } from 'react-router-dom';
import { 
  LogOut, 
  Play, 
  Pause, 
  RotateCcw, 
  LogIn, 
  Calendar, 
  Clock, 
  FileText, 
  User 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import EmployeeHistory from './EmployeeHistory';
import EmployeeRequests from './EmployeeRequests';
import EmployeeCalendar from './EmployeeCalendar';
import EmployeeProfile from './EmployeeProfile';

type TimeEntryType = 'turno' | 'coordinacion' | 'formacion' | 'sustitucion' | 'otros';

function TimeControl() {
  const [currentState, setCurrentState] = useState('initial');
  const [loading, setLoading] = useState(false);
  const [selectedTimeType, setSelectedTimeType] = useState<TimeEntryType | null>(null);
  const [selectedWorkCenter, setSelectedWorkCenter] = useState<string | null>(null);
  const [workCenters, setWorkCenters] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastClockInData, setLastClockInData] = useState<{timeType: TimeEntryType, workCenter: string} | null>(null);
  const [selectionPhase, setSelectionPhase] = useState<'none' | 'type' | 'center'>('none');
  const [pendingAction, setPendingAction] = useState<() => void>(() => {});

  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        const employeeId = localStorage.getItem('employeeId');
        if (!employeeId) throw new Error('No se encontró el ID del empleado');

        const { data: employeeData, error: employeeError } = await supabase
          .from('employee_profiles')
          .select('work_centers')
          .eq('id', employeeId)
          .single();

        if (employeeError) throw employeeError;
        if (employeeData?.work_centers) {
          setWorkCenters(employeeData.work_centers);
          if (employeeData.work_centers.length === 1) {
            setSelectedWorkCenter(employeeData.work_centers[0]);
          }
        }

        const { data: lastEntry, error: lastEntryError } = await supabase
          .from('time_entries')
          .select('*')
          .eq('employee_id', employeeId)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (lastEntryError) throw lastEntryError;

        if (lastEntry && lastEntry.length > 0) {
          const lastEntryType = lastEntry[0].entry_type;

          if (lastEntryType === 'clock_in') {
            const { data: hasClockOut } = await supabase
              .from('time_entries')
              .select('*')
              .eq('employee_id', employeeId)
              .eq('entry_type', 'clock_out')
              .gt('timestamp', lastEntry[0].timestamp)
              .limit(1);

            if (!hasClockOut || hasClockOut.length === 0) {
              setCurrentState('working');
              setSelectedWorkCenter(lastEntry[0].work_center);
              setSelectedTimeType(lastEntry[0].time_type);
              setLastClockInData({
                timeType: lastEntry[0].time_type,
                workCenter: lastEntry[0].work_center
              });
              return;
            }
          }

          switch (lastEntryType) {
            case 'break_start':
              setCurrentState('paused');
              setLastClockInData({
                timeType: lastEntry[0].time_type,
                workCenter: lastEntry[0].work_center
              });
              break;
            case 'break_end':
              setCurrentState('working');
              setLastClockInData({
                timeType: lastEntry[0].time_type,
                workCenter: lastEntry[0].work_center
              });
              break;
            default:
              setCurrentState('initial');
              break;
          }
        }
      } catch (err) {
        console.error('Error checking session:', err);
        setError(err instanceof Error ? err.message : 'Error al cargar los datos');
      }
    };

    checkActiveSession();
  }, []);

  const registerTimeEntry = async (entryType: 'clock_in' | 'break_start' | 'break_end' | 'clock_out') => {
    try {
      setLoading(true);
      setError(null);

      const employeeId = localStorage.getItem('employeeId');
      if (!employeeId) throw new Error('No se encontró el ID del empleado');

      if (entryType === 'clock_in') {
        if (!selectedTimeType) throw new Error('Debe seleccionar un tipo de fichaje');
        if (!selectedWorkCenter) throw new Error('Debe seleccionar un centro de trabajo');
      }

      if (entryType === 'clock_out') {
        const { data: lastClockIn } = await supabase
          .from('time_entries')
          .select('*')
          .eq('employee_id', employeeId)
          .eq('entry_type', 'clock_in')
          .order('timestamp', { ascending: false })
          .limit(1);

        if (!lastClockIn || lastClockIn.length === 0) {
          throw new Error('No hay ninguna entrada activa para registrar la salida');
        }

        const { data: subsequentClockOut } = await supabase
          .from('time_entries')
          .select('*')
          .eq('employee_id', employeeId)
          .eq('entry_type', 'clock_out')
          .gt('timestamp', lastClockIn[0].timestamp)
          .limit(1);

        if (subsequentClockOut && subsequentClockOut.length > 0) {
          throw new Error('Ya existe una salida registrada para esta entrada');
        }

        const clockInDate = new Date(lastClockIn[0].timestamp);
        const clockOutDate = new Date();

        const getDayBounds = (date: Date) => {
          const start = new Date(date);
          start.setHours(0, 0, 0, 0);
          const end = new Date(date);
          end.setHours(23, 59, 59, 999);
          return { start, end };
        };

        const clockInDay = getDayBounds(clockInDate);
        const clockOutDay = getDayBounds(clockOutDate);

        if (clockInDate.getDate() !== clockOutDate.getDate() || 
            clockInDate.getMonth() !== clockOutDate.getMonth() || 
            clockInDate.getFullYear() !== clockOutDate.getFullYear()) {
          
          const firstDayHours = (clockInDay.end.getTime() - clockInDate.getTime()) / (1000 * 60 * 60);
          const secondDayHours = (clockOutDate.getTime() - clockOutDay.start.getTime()) / (1000 * 60 * 60);

          await supabase.from('work_hours').insert([{
            employee_id: employeeId,
            date: clockInDay.start.toISOString().split('T')[0],
            hours: firstDayHours,
            time_type: lastClockIn[0].time_type,
            work_center: lastClockIn[0].work_center,
            clock_in: clockInDate.toISOString(),
            clock_out: clockInDay.end.toISOString(),
            is_split: true
          }]);

          await supabase.from('work_hours').insert([{
            employee_id: employeeId,
            date: clockOutDay.start.toISOString().split('T')[0],
            hours: secondDayHours,
            time_type: lastClockIn[0].time_type,
            work_center: lastClockIn[0].work_center,
            clock_in: clockOutDay.start.toISOString(),
            clock_out: clockOutDate.toISOString(),
            is_split: true
          }]);
        } else {
          const hoursWorked = (clockOutDate.getTime() - clockInDate.getTime()) / (1000 * 60 * 60);
          
          await supabase.from('work_hours').insert([{
            employee_id: employeeId,
            date: clockInDay.start.toISOString().split('T')[0],
            hours: hoursWorked,
            time_type: lastClockIn[0].time_type,
            work_center: lastClockIn[0].work_center,
            clock_in: clockInDate.toISOString(),
            clock_out: clockOutDate.toISOString(),
            is_split: false
          }]);
        }
      }

      let timeType = null;
      let workCenter = null;

      if (entryType === 'clock_in') {
        timeType = selectedTimeType;
        workCenter = selectedWorkCenter;
      } else if (lastClockInData) {
        timeType = lastClockInData.timeType;
        workCenter = lastClockInData.workCenter;
      }

      const { error: insertError } = await supabase
        .from('time_entries')
        .insert({
          employee_id: employeeId,
          entry_type: entryType,
          time_type: timeType,
          work_center: workCenter,
          timestamp: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      switch (entryType) {
        case 'clock_in':
          setCurrentState('working');
          setLastClockInData({
            timeType: timeType as TimeEntryType,
            workCenter: workCenter as string
          });
          break;
        case 'break_start':
          setCurrentState('paused');
          break;
        case 'break_end':
          setCurrentState('working');
          break;
        case 'clock_out':
          setCurrentState('initial');
          setSelectedTimeType(null);
          setSelectedWorkCenter(null);
          setLastClockInData(null);
          break;
      }
    } catch (err) {
      console.error('Error recording time entry:', err);
      setError(err instanceof Error ? err.message : 'Error al registrar el fichaje');
    } finally {
      setLoading(false);
      setSelectionPhase('none');
      setPendingAction(() => {});
    }
  };

  const safeRegisterTimeEntry = async (entryType: 'clock_in' | 'break_start' | 'break_end' | 'clock_out') => {
    if (entryType === 'clock_in') {
      if (!selectedTimeType) {
        setSelectionPhase('type');
        setPendingAction(() => () => registerTimeEntry(entryType));
        return;
      }
      if (!selectedWorkCenter) {
        setSelectionPhase('center');
        setPendingAction(() => () => registerTimeEntry(entryType));
        return;
      }
    }

    await registerTimeEntry(entryType);
  };

  const handleSelectTimeType = (type: TimeEntryType) => {
    setSelectedTimeType(type);
    setError(null);
    
    if (workCenters.length === 1) {
      setSelectedWorkCenter(workCenters[0]);
      if (pendingAction) {
        pendingAction();
      }
    } else {
      setSelectionPhase('center');
    }
  };

  const handleSelectWorkCenter = (center: string) => {
    setSelectedWorkCenter(center);
    setError(null);
    
    if (pendingAction) {
      pendingAction();
    }
  };

  const handleInitialAction = () => {
    if (!selectedTimeType) {
      setSelectionPhase('type');
      return;
    }
    safeRegisterTimeEntry('clock_in');
  };

  const getTimeTypeButtonClass = (type: TimeEntryType) => {
    const baseClass = "w-full font-medium py-3 px-4 rounded-lg transition-colors";
    
    if (selectedTimeType === type) {
      return `${baseClass} bg-blue-600 text-white`;
    }
    
    return `${baseClass} bg-blue-50 hover:bg-blue-100 text-blue-700`;
  };

  const getWorkCenterButtonClass = (center: string) => {
    const baseClass = "w-full font-medium py-3 px-4 rounded-lg transition-colors";
    
    if (selectedWorkCenter === center) {
      return `${baseClass} bg-blue-600 text-white`;
    }
    
    return `${baseClass} bg-blue-50 hover:bg-blue-100 text-blue-700`;
  };

  const renderSelectors = () => {
    if (selectionPhase === 'type') {
      return (
        <div className="mb-6 animate-fade-in">
          <h3 className="text-lg font-medium text-gray-700 mb-4">Selecciona el tipo de fichaje:</h3>
          <div className="space-y-3">
            <button
              onClick={() => handleSelectTimeType('turno')}
              className={getTimeTypeButtonClass('turno')}
            >
              Fichaje de turno
            </button>
            <button
              onClick={() => handleSelectTimeType('coordinacion')}
              className={getTimeTypeButtonClass('coordinacion')}
            >
              Fichaje de coordinación
            </button>
            <button
              onClick={() => handleSelectTimeType('formacion')}
              className={getTimeTypeButtonClass('formacion')}
            >
              Fichaje de formación
            </button>
            <button
              onClick={() => handleSelectTimeType('sustitucion')}
              className={getTimeTypeButtonClass('sustitucion')}
            >
              Fichaje de horas de sustitución
            </button>
            <button
              onClick={() => handleSelectTimeType('otros')}
              className={getTimeTypeButtonClass('otros')}
            >
              Otros
            </button>
          </div>
        </div>
      );
    }

    if (selectionPhase === 'center') {
      return (
        <div className="mb-6 animate-fade-in">
          <h3 className="text-lg font-medium text-gray-700 mb-4">Selecciona el centro de trabajo:</h3>
          <div className="space-y-3">
            {workCenters.map(center => (
              <button
                key={center}
                onClick={() => handleSelectWorkCenter(center)}
                className={getWorkCenterButtonClass(center)}
              >
                {center}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  const actionButtons = [
    {
      text: 'Entrada',
      icon: <LogIn className="h-6 w-6" />,
      onClick: handleInitialAction,
      disabled: currentState !== 'initial' || loading,
      color: currentState === 'initial' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-100'
    },
    {
      text: 'Pausa',
      icon: <Pause className="h-6 w-6" />,
      onClick: () => safeRegisterTimeEntry('break_start'),
      disabled: currentState !== 'working' || loading,
      color: currentState === 'working' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-100'
    },
    {
      text: 'Volver',
      icon: <RotateCcw className="h-6 w-6" />,
      onClick: () => safeRegisterTimeEntry('break_end'),
      disabled: currentState !== 'paused' || loading,
      color: currentState === 'paused' ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-100'
    },
    {
      text: 'Salida',
      icon: <LogOut className="h-6 w-6" />,
      onClick: () => safeRegisterTimeEntry('clock_out'),
      disabled: currentState === 'initial' || loading,
      color: currentState !== 'initial' ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-100'
    }
  ];

  const renderActionButtons = () => (
    <div className="space-y-4">
      {actionButtons.map((button, index) => (
        <button
          key={index}
          onClick={button.onClick}
          disabled={button.disabled}
          className={`w-full ${button.color} text-white font-bold py-4 px-6 rounded-lg flex items-center justify-center space-x-2 transition-colors duration-200 disabled:opacity-50`}
        >
          {button.icon}
          <span className="text-xl">{button.text}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="space-y-6 max-w-md mx-auto">
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Registro de Jornada</h2>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
              {error}
            </div>
          )}

          {renderSelectors()}

          {renderActionButtons()}

          {selectedTimeType && currentState !== 'initial' && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-blue-700 font-medium">
                Tipo de fichaje actual: {' '}
                {selectedTimeType === 'turno' ? 'Fichaje de turno' :
                 selectedTimeType === 'coordinacion' ? 'Fichaje de coordinación' :
                 selectedTimeType === 'formacion' ? 'Fichaje de formación' :
                 selectedTimeType === 'sustitucion' ? 'Fichaje de horas de sustitución' :
                 'Otros'}
              </p>
            </div>
          )}

          {selectedWorkCenter && currentState !== 'initial' && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg">
              <p className="text-green-700 font-medium">
                Centro de trabajo actual: {selectedWorkCenter}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmployeeDashboard() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email || null);
    };
    getUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('employeeId');
    navigate('/login/empleado');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-blue-600 mr-2" />
                <span className="text-xl font-bold text-gray-900">Portal Trabajador/a</span>
              </div>
              <Link to="/empleado/fichar" className="text-gray-900 hover:text-gray-700 px-3 py-2 font-medium">
                Fichar
              </Link>
              <Link to="/empleado/historial" className="text-blue-600 hover:text-blue-700 px-3 py-2 font-medium">
                Historial
              </Link>
              <Link to="/empleado/solicitudes" className="text-blue-600 hover:text-blue-700 px-3 py-2 font-medium">
                Solicitudes
              </Link>
              <Link to="/empleado/calendario" className="text-blue-600 hover:text-blue-700 px-3 py-2 font-medium">
                Calendario
              </Link>
              <Link to="/empleado/perfil" className="text-blue-600 hover:text-blue-700 px-3 py-2 font-medium">
                Perfil
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <User className="h-5 w-5 text-gray-500" />
                <span className="text-sm text-gray-600">{userEmail}</span>
              </div>
              <button 
                onClick={handleLogout}
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
        <Route path="/" element={<TimeControl />} />
        <Route path="/fichar" element={<TimeControl />} />
        <Route path="/historial" element={<EmployeeHistory />} />
        <Route path="/solicitudes" element={<EmployeeRequests />} />
        <Route path="/calendario" element={<EmployeeCalendar />} />
        <Route path="/perfil" element={<EmployeeProfile />} />
      </Routes>
    </div>
  );
}

export default EmployeeDashboard;