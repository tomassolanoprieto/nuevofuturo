import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, Search, FileText, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface DailyReport {
  date: string;
  clock_in: string;
  clock_out: string;
  break_duration: string;
  total_hours: number;
}

interface Report {
  employee: {
    fiscal_name: string;
    email: string;
    work_centers: string[];
    document_number: string;
  };
  date: string;
  entry_type: string;
  timestamp: string;
  work_center?: string;
  total_hours?: number;
  daily_reports?: DailyReport[];
  monthly_hours?: number[];
}

export default function CompanyReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reportType, setReportType] = useState<'daily' | 'annual' | 'official' | 'alarms'>('daily');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkCenter, setSelectedWorkCenter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<string[]>([]);
  const [hoursLimit, setHoursLimit] = useState<number>(40);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  useEffect(() => {
    fetchWorkCenters();
    fetchEmployees();
  }, []);

  useEffect(() => {
    if ((reportType === 'daily' || reportType === 'official' || reportType === 'alarms') && startDate && endDate) {
      generateReport();
    } else if (reportType === 'annual' && selectedYear) {
      generateReport();
    }
  }, [reportType, searchTerm, selectedWorkCenter, startDate, endDate, selectedEmployee, hoursLimit, selectedYear]);

  const fetchWorkCenters = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('employee_profiles')
        .select('work_centers')
        .eq('company_id', user.id);

      if (data) {
        const uniqueWorkCenters = [...new Set(data.flatMap(emp => emp.work_centers || []))];
        setWorkCenters(uniqueWorkCenters);
      }
    } catch (error) {
      console.error('Error fetching work centers:', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('employee_profiles')
        .select('*')
        .eq('company_id', user.id)
        .eq('is_active', true);

      const { data } = await query;
      if (data) {
        setEmployees(data);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const generateReport = async () => {
    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let employeeQuery = supabase
        .from('employee_profiles')
        .select('*')
        .eq('company_id', user.id)
        .eq('is_active', true);

      if (selectedWorkCenter) {
        employeeQuery = employeeQuery.contains('work_centers', [selectedWorkCenter]);
      }

      if (searchTerm) {
        employeeQuery = employeeQuery.ilike('fiscal_name', `%${searchTerm}%`);
      }

      const { data: employees } = await employeeQuery;
      if (!employees) return;

      // Obtener todos los registros de time_entries para los empleados filtrados
      const { data: timeEntries } = await supabase
        .from('time_entries')
        .select('*')
        .in('employee_id', employees.map(emp => emp.id))
        .eq('is_active', true)
        .gte('timestamp', reportType === 'annual' ? new Date(selectedYear || new Date().getFullYear(), 0, 1).toISOString() : startDate)
        .lte('timestamp', reportType === 'annual' ? new Date(selectedYear || new Date().getFullYear(), 11, 31).toISOString() : endDate)
        .order('timestamp', { ascending: true });

      if (!timeEntries) return;

      let reportData: Report[] = [];

      switch (reportType) {
        case 'official': {
          if (!selectedEmployee) break;

          const employee = employees.find(emp => emp.id === selectedEmployee);
          if (!employee) break;

          // Obtener todos los días dentro del rango de fechas
          const start = new Date(startDate);
          const end = new Date(endDate);
          const daysInRange = [];
          for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
            daysInRange.push(new Date(d));
          }

          // Filtrar registros para el empleado seleccionado
          const employeeEntries = timeEntries.filter(entry => entry.employee_id === selectedEmployee);

          // Generar las filas para cada día en el rango
          const dailyReports: DailyReport[] = daysInRange.map(date => {
            const dateKey = date.toISOString().split('T')[0];
            const entries = employeeEntries.filter(entry => entry.timestamp.startsWith(dateKey));

            const clockIn = entries.find(e => e.entry_type === 'clock_in')?.timestamp;
            const clockOut = entries.find(e => e.entry_type === 'clock_out')?.timestamp;

            let breakDuration = 0;
            let breakStart = null;
            entries.forEach(entry => {
              if (entry.entry_type === 'break_start') {
                breakStart = new Date(entry.timestamp);
              } else if (entry.entry_type === 'break_end' && breakStart) {
                breakDuration += (new Date(entry.timestamp).getTime() - breakStart.getTime());
                breakStart = null;
              }
            });

            // Calcular horas trabajadas
            let totalHours = 0;
            if (clockIn && clockOut) {
              const start = new Date(clockIn);
              const end = new Date(clockOut);
              totalHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60); // Duración en horas
              totalHours -= breakDuration / (1000 * 60 * 60); // Restar las pausas
            }

            return {
              date: date.toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
              }),
              clock_in: clockIn ? new Date(clockIn).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '',
              clock_out: clockOut ? new Date(clockOut).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '',
              break_duration: breakDuration > 0 ? `${Math.floor(breakDuration / (1000 * 60 * 60))}:${Math.floor((breakDuration % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0')}` : '',
              total_hours: totalHours
            };
          });

          reportData = [{
            employee: {
              fiscal_name: employee.fiscal_name,
              email: employee.email,
              work_centers: employee.work_centers,
              document_number: employee.document_number
            },
            date: startDate,
            entry_type: '',
            timestamp: '',
            daily_reports: dailyReports
          }];
          break;
        }

        case 'daily': {
          // Resumen Diario
          const groupedByEmployee = employees.map(employee => {
            const employeeEntries = timeEntries.filter(entry => entry.employee_id === employee.id);

            // Agrupar registros por día
            const entriesByDate: { [date: string]: any[] } = {};
            employeeEntries.forEach(entry => {
              const dateKey = entry.timestamp.split('T')[0];
              if (!entriesByDate[dateKey]) {
                entriesByDate[dateKey] = [];
              }
              entriesByDate[dateKey].push(entry);
            });

            // Calcular horas trabajadas en todos los días del rango
            let totalHours = 0;
            Object.values(entriesByDate).forEach(entries => {
              const clockIn = entries.find(e => e.entry_type === 'clock_in')?.timestamp;
              const clockOut = entries.find(e => e.entry_type === 'clock_out')?.timestamp;

              if (clockIn && clockOut) {
                const start = new Date(clockIn);
                const end = new Date(clockOut);
                let duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60); // Duración en horas

                // Restar las pausas
                let breakDuration = 0;
                let breakStart = null;
                entries.forEach(entry => {
                  if (entry.entry_type === 'break_start') {
                    breakStart = new Date(entry.timestamp);
                  } else if (entry.entry_type === 'break_end' && breakStart) {
                    breakDuration += (new Date(entry.timestamp).getTime() - breakStart.getTime());
                    breakStart = null;
                  }
                });

                duration -= breakDuration / (1000 * 60 * 60); // Restar las pausas
                totalHours += duration;
              }
            });

            return {
              employee: {
                fiscal_name: employee.fiscal_name,
                email: employee.email,
                work_centers: employee.work_centers,
                document_number: employee.document_number
              },
              date: `${startDate} - ${endDate}`,
              entry_type: '',
              timestamp: '',
              total_hours: totalHours
            };
          });

          reportData = groupedByEmployee;
          break;
        }

        case 'annual': {
          // Resumen Anual
          const groupedByEmployee = employees.map(employee => {
            const employeeEntries = timeEntries.filter(entry => entry.employee_id === employee.id);

            // Agrupar registros por día
            const entriesByDate: { [date: string]: any[] } = {};
            employeeEntries.forEach(entry => {
              const dateKey = entry.timestamp.split('T')[0];
              if (!entriesByDate[dateKey]) {
                entriesByDate[dateKey] = [];
              }
              entriesByDate[dateKey].push(entry);
            });

            // Calcular horas trabajadas por mes
            const totalHoursByMonth = Array(12).fill(0);
            Object.values(entriesByDate).forEach(entries => {
              const entryMonth = new Date(entries[0].timestamp).getMonth();
              const clockIn = entries.find(e => e.entry_type === 'clock_in')?.timestamp;
              const clockOut = entries.find(e => e.entry_type === 'clock_out')?.timestamp;

              if (clockIn && clockOut) {
                const start = new Date(clockIn);
                const end = new Date(clockOut);
                let duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60); // Duración en horas

                // Restar las pausas
                let breakDuration = 0;
                let breakStart = null;
                entries.forEach(entry => {
                  if (entry.entry_type === 'break_start') {
                    breakStart = new Date(entry.timestamp);
                  } else if (entry.entry_type === 'break_end' && breakStart) {
                    breakDuration += (new Date(entry.timestamp).getTime() - breakStart.getTime());
                    breakStart = null;
                  }
                });

                duration -= breakDuration / (1000 * 60 * 60); // Restar las pausas
                totalHoursByMonth[entryMonth] += duration;
              }
            });

            return {
              employee: {
                fiscal_name: employee.fiscal_name,
                email: employee.email,
                work_centers: employee.work_centers,
                document_number: employee.document_number
              },
              date: `Año ${selectedYear}`,
              entry_type: '',
              timestamp: '',
              total_hours: totalHoursByMonth.reduce((acc, hours) => acc + hours, 0),
              monthly_hours: totalHoursByMonth
            };
          });

          reportData = groupedByEmployee;
          break;
        }

        case 'alarms': {
          // Alarmas
          const groupedByEmployee = employees.map(employee => {
            const employeeEntries = timeEntries.filter(entry => entry.employee_id === employee.id);

            // Agrupar registros por día
            const entriesByDate: { [date: string]: any[] } = {};
            employeeEntries.forEach(entry => {
              const dateKey = entry.timestamp.split('T')[0];
              if (!entriesByDate[dateKey]) {
                entriesByDate[dateKey] = [];
              }
              entriesByDate[dateKey].push(entry);
            });

            // Calcular horas trabajadas en todos los días del rango
            let totalHours = 0;
            Object.values(entriesByDate).forEach(entries => {
              const clockIn = entries.find(e => e.entry_type === 'clock_in')?.timestamp;
              const clockOut = entries.find(e => e.entry_type === 'clock_out')?.timestamp;

              if (clockIn && clockOut) {
                const start = new Date(clockIn);
                const end = new Date(clockOut);
                let duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60); // Duración en horas

                // Restar las pausas
                let breakDuration = 0;
                let breakStart = null;
                entries.forEach(entry => {
                  if (entry.entry_type === 'break_start') {
                    breakStart = new Date(entry.timestamp);
                  } else if (entry.entry_type === 'break_end' && breakStart) {
                    breakDuration += (new Date(entry.timestamp).getTime() - breakStart.getTime());
                    breakStart = null;
                  }
                });

                duration -= breakDuration / (1000 * 60 * 60); // Restar las pausas
                totalHours += duration;
              }
            });

            return {
              employee: {
                fiscal_name: employee.fiscal_name,
                email: employee.email,
                work_centers: employee.work_centers,
                document_number: employee.document_number
              },
              date: '-',
              entry_type: '-',
              timestamp: '-',
              total_hours: totalHours
            };
          });

          // Filtrar empleados que superen el límite de horas
          reportData = groupedByEmployee
            .filter(({ total_hours }) => total_hours > hoursLimit)
            .map(({ employee, total_hours }) => ({
              employee,
              date: '-',
              entry_type: '-',
              timestamp: '-',
              total_hours
            }));
          break;
        }
      }

      setReports(reportData);
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (reportType === 'official') {
      if (!selectedEmployee || !startDate || !endDate) {
        alert('Por favor seleccione un empleado y el rango de fechas');
        return;
      }

      const report = reports[0];
      if (!report || !report.daily_reports) return;

      const doc = new jsPDF();

      // Title
      doc.setFontSize(14);
      doc.text('Listado mensual del registro de jornada', 105, 20, { align: 'center' });

      // Company and employee information
      doc.setFontSize(10);
      const tableData = [
        ['Empresa: CONTROLALTSUP S.L.', `Trabajador: ${report.employee.fiscal_name}`],
        ['C.I.F/N.I.F: B87304283', `N.I.F: ${report.employee.document_number}`],
        [`Centro de Trabajo: ${report.employee.work_centers.join(', ')}`, `Nº Afiliación: 281204329001`],
        ['C.C.C:', `Mes y Año: ${new Date(startDate).toLocaleDateString('es-ES', { month: '2-digit', year: 'numeric' })}`]
      ];

      doc.autoTable({
        startY: 30,
        head: [],
        body: tableData,
        theme: 'plain',
        styles: {
          cellPadding: 2,
          fontSize: 10
        },
        columnStyles: {
          0: { cellWidth: 95 },
          1: { cellWidth: 95 }
        }
      });

      // Daily records
      const recordsData = report.daily_reports.map(day => [
        day.date,
        day.clock_in,
        day.clock_out,
        day.break_duration,
        day.total_hours ? 
          `${Math.floor(day.total_hours)}:${Math.round((day.total_hours % 1) * 60).toString().padStart(2, '0')}` : 
          '0:00' // Mostrar 0:00 si no hay horas
      ]);

      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 10,
        head: [['DIA', 'ENTRADA', 'SALIDA', 'PAUSAS', 'HORAS ORDINARIAS']],
        body: recordsData,
        theme: 'grid',
        styles: {
          cellPadding: 2,
          fontSize: 8,
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 35 },
          2: { cellWidth: 35 },
          3: { cellWidth: 35 },
          4: { cellWidth: 35 }
        }
      });

      // Total hours
      const totalHours = report.daily_reports.reduce((acc, day) => acc + (day.total_hours || 0), 0);
      const hours = Math.floor(totalHours);
      const minutes = Math.round((totalHours % 1) * 60);
      const totalFormatted = `${hours}:${minutes.toString().padStart(2, '0')}`;

      doc.autoTable({
        startY: doc.lastAutoTable.finalY,
        head: [],
        body: [['TOTAL HORAS', '', '', '', totalFormatted]],
        theme: 'grid',
        styles: {
          cellPadding: 2,
          fontSize: 8,
          halign: 'center',
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 35 },
          2: { cellWidth: 35 },
          3: { cellWidth: 35 },
          4: { cellWidth: 35 }
        }
      });

      // Signatures
      doc.setFontSize(10);
      doc.text('Firma de la Empresa:', 40, doc.lastAutoTable.finalY + 30);
      doc.text('Firma del Trabajador:', 140, doc.lastAutoTable.finalY + 30);

      // Place and date
      doc.setFontSize(8);
      doc.text(`En Madrid, a ${new Date().toLocaleDateString('es-ES', { 
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })}`, 14, doc.lastAutoTable.finalY + 60);

      // Legal note
      doc.setFontSize(6);
      const legalText = 'Registro realizado en cumplimiento del Real Decreto-ley 8/2019, de 8 de marzo, de medidas urgentes de protección social y de lucha contra la precariedad laboral en la jornada de trabajo ("BOE" núm. 61 de 12 de marzo), la regulación de forma expresa en el artículo 34 del texto refundido de la Ley del Estatuto de los Trabajadores (ET), la obligación de las empresas de registrar diariamente la jornada laboral.';
      doc.text(legalText, 14, doc.lastAutoTable.finalY + 70, {
        maxWidth: 180,
        align: 'justify'
      });

      doc.save(`informe_oficial_${report.employee.fiscal_name}_${startDate}.pdf`);
    } else {
      const exportData = reports.map(report => ({
        'Nombre': report.employee.fiscal_name,
        'Email': report.employee.email,
        'Centros de Trabajo': report.employee.work_centers.join(', '),
        'Fecha': report.date,
        'Tipo': report.entry_type,
        'Hora': report.timestamp,
        'Centro de Trabajo': report.work_center || '',
        ...(report.total_hours ? { 'Horas Totales': report.total_hours } : {})
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Informe');
      
      const reportName = `informe_${reportType}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, reportName);
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Informes</h1>
          <p className="text-gray-600">Genera y exporta informes detallados</p>
        </div>

        <div className="mb-6 flex gap-4">
          <button
            onClick={() => setReportType('daily')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              reportType === 'daily'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <FileText className="w-5 h-5" />
            Resumen Diario
          </button>
          <button
            onClick={() => setReportType('annual')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              reportType === 'annual'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <FileText className="w-5 h-5" />
            Resumen Anual
          </button>
          <button
            onClick={() => setReportType('official')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              reportType === 'official'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <FileText className="w-5 h-5" />
            Informe Oficial
          </button>
          <button
            onClick={() => setReportType('alarms')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              reportType === 'alarms'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
            Alarmas
          </button>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm space-y-4 mb-6">
          <h2 className="text-lg font-semibold">Filtros</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {reportType === 'official' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Empleado
                </label>
                <select
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleccionar empleado</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fiscal_name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Centro de Trabajo
                  </label>
                  <select
                    value={selectedWorkCenter}
                    onChange={(e) => setSelectedWorkCenter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Todos los centros</option>
                    {workCenters.map((center) => (
                      <option key={center} value={center}>
                        {center}
                      </option>
                    ))}
                  </select>
                </div>

                {reportType === 'alarms' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Límite de Horas
                    </label>
                    <input
                      type="number"
                      value={hoursLimit.toString()}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (!isNaN(value) && value > 0) {
                          setHoursLimit(value);
                        }
                      }}
                      min="1"
                      step="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}
              </>
            )}

            {(reportType === 'daily' || reportType === 'official' || reportType === 'alarms') && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha Inicio
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </>
            )}

            {reportType === 'annual' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Año
                </label>
                <select
                  value={selectedYear || ''}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleccionar año</option>
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i} value={new Date().getFullYear() - i}>
                      {new Date().getFullYear() - i}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-5 h-5" />
            {reportType === 'official' ? 'Generar PDF' : 'Exportar a Excel'}
          </button>
        </div>

        {reportType !== 'official' && (
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
                    {reportType === 'daily' ? (
                      <>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fechas
                        </th>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Horas
                        </th>
                      </>
                    ) : reportType === 'annual' ? (
                      <>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Enero
                        </th>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Febrero
                        </th>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Marzo
                        </th>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Abril
                        </th>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Mayo
                        </th>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Junio
                        </th>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Julio
                        </th>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Agosto
                        </th>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Septiembre
                        </th>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Octubre
                        </th>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Noviembre
                        </th>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Diciembre
                        </th>
                        <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Horas
                        </th>
                      </>
                    ) : (
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Horas Totales
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan={reportType === 'annual' ? 14 : 6} className="px-6 py-4 text-center">
                        Cargando...
                      </td>
                    </tr>
                  ) : reports.length === 0 ? (
                    <tr>
                      <td colSpan={reportType === 'annual' ? 14 : 6} className="px-6 py-4 text-center">
                        No hay datos para mostrar
                      </td>
                    </tr>
                  ) : (
                    reports.map((report, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {report.employee.fiscal_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {report.employee.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {report.employee.work_centers.join(', ')}
                        </td>
                        {reportType === 'daily' ? (
                          <>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {report.date}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {report.total_hours?.toFixed(2)} h
                            </td>
                          </>
                        ) : reportType === 'annual' ? (
                          <>
                            {report.monthly_hours?.map((hours, i) => (
                              <td key={i} className="px-6 py-4 whitespace-nowrap">
                                {hours.toFixed(2)} h
                              </td>
                            ))}
                            <td className="px-6 py-4 whitespace-nowrap">
                              {report.total_hours?.toFixed(2)} h
                            </td>
                          </>
                        ) : (
                          <td className="px-6 py-4 whitespace-nowrap">
                            {report.total_hours?.toFixed(2)} h
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}