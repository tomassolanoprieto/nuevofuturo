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
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [selectedWorkCenter, setSelectedWorkCenter] = useState<string | null>(null);
  const [workCenters, setWorkCenters] = useState<string[]>([]);
  const [showWorkCenterSelector, setShowWorkCenterSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geolocation, setGeolocation] = useState<{ latitude: number | null; longitude: number | null }>({
    latitude: null,
    longitude: null,
  });

  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        const employeeId = localStorage.getItem('employeeId');
        if (!employeeId) {
          throw new Error('No se encontró el ID del empleado');
        }

        // Obtener los centros de trabajo del empleado
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

        // Obtener la última entrada
        const { data: lastEntry, error: lastEntryError } = await supabase
          .from('time_entries')
          .select('*')
          .eq('employee_id', employeeId)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (lastEntryError) throw lastEntryError;

        if (lastEntry && lastEntry.length > 0) {
          const lastEntryType = lastEntry[0].entry_type;

          // Actualizar el estado según la última entrada
          switch (lastEntryType) {
            case 'clock_in':
              setCurrentState('working');
              setSelectedWorkCenter(lastEntry[0].work_center);
              setSelectedTimeType(lastEntry[0].time_type);
              break;
            case 'break_start':
              setCurrentState('paused');
              setSelectedWorkCenter(lastEntry[0].work_center);
              setSelectedTimeType(lastEntry[0].time_type);
              break;
            case 'break_end':
              setCurrentState('working');
              setSelectedWorkCenter(lastEntry[0].work_center);
              setSelectedTimeType(lastEntry[0].time_type);
              break;
            case 'clock_out':
              setCurrentState('initial');
              setSelectedWorkCenter(null);
              setSelectedTimeType(null);
              break;
            default:
              setCurrentState('initial');
              setSelectedWorkCenter(null);
              setSelectedTimeType(null);
              break;
          }
        } else {
          // Si no hay entradas, el estado inicial es 'initial'
          setCurrentState('initial');
          setSelectedWorkCenter(null);
          setSelectedTimeType(null);
        }
      } catch (err) {
        console.error('Error checking session:', err);
        setError(err instanceof Error ? err.message : 'Error al cargar los datos');
      }
    };

    checkActiveSession();
  }, []);

  const getGeolocation = async () => {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch (error) {
      console.error('Error obteniendo la geolocalización:', error);
      return {
        latitude: null,
        longitude: null,
      };
    }
  };

  const handleTimeEntry = async (entryType: 'clock_in' | 'break_start' | 'break_end' | 'clock_out') => {
    try {
      setLoading(true);
      setError(null);

      const employeeId = localStorage.getItem('employeeId');
      if (!employeeId) {
        throw new Error('No se encontró el ID del empleado');
      }

      // Verificar si hay una entrada activa antes de registrar una salida
      if (entryType === 'clock_out' && currentState === 'initial') {
        throw new Error('Debe existir una entrada activa antes de registrar una salida.');
      }

      // Para clock_in, necesitamos el tipo de tiempo
      if (entryType === 'clock_in') {
        if (!selectedTimeType) {
          setShowTypeSelector(true);
          return;
        }
        
        // Si hay más de un centro de trabajo y no hay uno seleccionado
        if (workCenters.length > 1 && !selectedWorkCenter) {
          setShowWorkCenterSelector(true);
          return;
        }
      }

      // Obtener la geolocalización (puede ser null si no se obtiene)
      const { latitude, longitude } = await getGeolocation();
      setGeolocation({ latitude, longitude });

      const { error: insertError } = await supabase
        .from('time_entries')
        .insert([{
          employee_id: employeeId,
          entry_type: entryType,
          time_type: entryType === 'clock_in' ? selectedTimeType : null,
          work_center: entryType === 'clock_in' ? selectedWorkCenter : null,
          timestamp: new Date().toISOString(),
          latitude,
          longitude,
        }]);

      if (insertError) throw insertError;

      // Actualizar el estado según la entrada registrada
      switch (entryType) {
        case 'clock_in':
          setCurrentState('working');
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
          break;
      }
    } catch (err) {
      console.error('Error recording time entry:', err);
      setError(err instanceof Error ? err.message : 'Error al registrar el fichaje');
    } finally {
      setLoading(false);
      setShowTypeSelector(false);
      setShowWorkCenterSelector(false);
    }
  };

  const handleSelectWorkCenter = (center: string) => {
    setSelectedWorkCenter(center);
    setShowWorkCenterSelector(false);
    handleTimeEntry('clock_in');
  };

  const handleSelectTimeType = (type: TimeEntryType) => {
    setSelectedTimeType(type);
    setShowTypeSelector(false);
    if (workCenters.length > 1 && !selectedWorkCenter) {
      setShowWorkCenterSelector(true);
    } else if (selectedWorkCenter || workCenters.length === 1) {
      handleTimeEntry('clock_in');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="space-y-6 max-w-md mx-auto">
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Control de Tiempo</h2>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
              {error}
            </div>
          )}

          {showWorkCenterSelector && currentState === 'initial' && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-700 mb-4">Selecciona el centro de trabajo:</h3>
              <div className="space-y-3">
                {workCenters.map(center => (
                  <button
                    key={center}
                    onClick={() => handleSelectWorkCenter(center)}
                    className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium py-3 px-4 rounded-lg transition-colors"
                  >
                    {center}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showTypeSelector && currentState === 'initial' && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-700 mb-4">Selecciona el tipo de fichaje:</h3>
              <div className="space-y-3">
                <button
                  onClick={() => handleSelectTimeType('turno')}
                  className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium py-3 px-4 rounded-lg transition-colors"
                >
                  Fichaje de turno
                </button>
                <button
                  onClick={() => handleSelectTimeType('coordinacion')}
                  className="w-full bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium py-3 px-4 rounded-lg transition-colors"
                >
                  Fichaje de coordinación
                </button>
                <button
                  onClick={() => handleSelectTimeType('formacion')}
                  className="w-full bg-green-50 hover:bg-green-100 text-green-700 font-medium py-3 px-4 rounded-lg transition-colors"
                >
                  Fichaje de formación
                </button>
                <button
                  onClick={() => handleSelectTimeType('sustitucion')}
                  className="w-full bg-yellow-50 hover:bg-yellow-100 text-yellow-700 font-medium py-3 px-4 rounded-lg transition-colors"
                >
                  Fichaje de horas de sustitución
                </button>
                <button
                  onClick={() => handleSelectTimeType('otros')}
                  className="w-full bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium py-3 px-4 rounded-lg transition-colors"
                >
                  Otros
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={() => {
                if (!selectedTimeType) {
                  setShowTypeSelector(true);
                } else if (workCenters.length > 1 && !selectedWorkCenter) {
                  setShowWorkCenterSelector(true);
                } else {
                  handleTimeEntry('clock_in');
                }
              }}
              disabled={currentState !== 'initial' || loading}
              className={`w-full ${
                currentState === 'initial'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-100'
              } text-white font-bold py-4 px-6 rounded-lg flex items-center justify-center space-x-2 transition-colors duration-200 disabled:opacity-50`}
            >
              <LogIn className="h-6 w-6" />
              <span className="text-xl">Entrada</span>
            </button>

            <button
              onClick={() => handleTimeEntry('break_start')}
              disabled={currentState !== 'working' || loading}
              className={`w-full ${
                currentState === 'working'
                  ? 'bg-orange-500 hover:bg-orange-600'
                  : 'bg-gray-100'
              } text-white font-bold py-4 px-6 rounded-lg flex items-center justify-center space-x-2 transition-colors duration-200 disabled:opacity-50`}
            >
              <Pause className="h-6 w-6" />
              <span className="text-xl">Pausa</span>
            </button>

            <button
              onClick={() => handleTimeEntry('break_end')}
              disabled={currentState !== 'paused' || loading}
              className={`w-full ${
                currentState === 'paused'
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-gray-100'
              } text-white font-bold py-4 px-6 rounded-lg flex items-center justify-center space-x-2 transition-colors duration-200 disabled:opacity-50`}
            >
              <RotateCcw className="h-6 w-6" />
              <span className="text-xl">Volver</span>
            </button>

            <button
              onClick={() => handleTimeEntry('clock_out')}
              disabled={currentState === 'initial' || loading}
              className={`w-full ${
                currentState !== 'initial'
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-gray-100'
              } text-white font-bold py-4 px-6 rounded-lg flex items-center justify-center space-x-2 transition-colors duration-200 disabled:opacity-50`}
            >
              <LogOut className="h-6 w-6" />
              <span className="text-xl">Salida</span>
            </button>
          </div>

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

          {geolocation.latitude && geolocation.longitude && (
            <div className="mt-4 p-4 bg-purple-50 rounded-lg">
              <p className="text-purple-700 font-medium">
                Ubicación registrada: Latitud {geolocation.latitude}, Longitud {geolocation.longitude}
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
                <span className="text-xl font-bold text-gray-900">Portal Empleado</span>
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