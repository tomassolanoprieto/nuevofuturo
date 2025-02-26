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
    delegation: string;
    document_number: string;
  };
  date: string;
  entry_type: string;
  timestamp: string;
  work_center?: string;
  total_hours?: number;
  daily_reports?: DailyReport[];
}

export default function CompanyReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reportType, setReportType] = useState<'general' | 'official' | 'alarms'>('general');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkCenter, setSelectedWorkCenter] = useState('');
  const [selectedDelegation, setSelectedDelegation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<string[]>([]);
  const [delegations, setDelegations] = useState<string[]>([]);
  const [hoursLimit, setHoursLimit] = useState<number>(40);

  useEffect(() => {
    fetchWorkCenters();
    fetchDelegations();
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      generateReport();
    }
  }, [reportType, searchTerm, selectedWorkCenter, selectedDelegation, startDate, endDate, selectedEmployee, hoursLimit]);

  const fetchWorkCenters = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('employee_profiles')
        .select('work_centers')
        .eq('company_id', user.id);

      if (data) {
        const uniqueWorkCenters = [...new Set(data.flatMap(emp => emp.work_centers))];
        setWorkCenters(uniqueWorkCenters);
      }
    } catch (error) {
      console.error('Error fetching work centers:', error);
    }
  };

  const fetchDelegations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('employee_profiles')
        .select('delegation')
        .eq('company_id', user.id);

      if (data) {
        const uniqueDelegations = [...new Set(data.map(emp => emp.delegation).filter(Boolean))];
        setDelegations(uniqueDelegations);
      }
    } catch (error) {
      console.error('Error fetching delegations:', error);
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

      if (selectedWorkCenter) {
        query = query.contains('work_centers', [selectedWorkCenter]);
      }

      if (selectedDelegation) {
        query = query.eq('delegation', selectedDelegation);
      }

      const { data } = await query;
      if (data) {
        setEmployees(data);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const generateReport = async () => {
    if (!startDate || !endDate) return;
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

      if (selectedDelegation) {
        employeeQuery = employeeQuery.eq('delegation', selectedDelegation);
      }

      if (searchTerm) {
        employeeQuery = employeeQuery.ilike('fiscal_name', `%${searchTerm}%`);
      }

      const { data: employees } = await employeeQuery;
      if (!employees) return;

      let reportData: Report[] = [];

      switch (reportType) {
        case 'official': {
          if (!selectedEmployee) break;

          const employee = employees.find(emp => emp.id === selectedEmployee);
          if (!employee) break;

          // Get daily work hours for the date range
          const { data: dailyHours } = await supabase
            .from('daily_work_hours')
            .select('*')
            .eq('employee_id', selectedEmployee)
            .gte('work_date', startDate)
            .lte('work_date', endDate)
            .order('work_date', { ascending: true });

          if (!dailyHours) break;

          // Process each day's entries
          const dailyReports: DailyReport[] = dailyHours.map(day => {
            const entries = day.timestamps.map((ts: string, i: number) => ({
              timestamp: new Date(ts),
              type: day.entry_types[i],
              work_center: day.work_centers[i]
            }));

            // Find clock in/out times
            const clockIn = entries.find(e => e.type === 'clock_in')?.timestamp;
            const clockOut = entries.find(e => e.type === 'clock_out')?.timestamp;

            // Calculate break duration
            let breakDuration = 0;
            let breakStart = null;
            entries.forEach(entry => {
              if (entry.type === 'break_start') {
                breakStart = entry.timestamp;
              } else if (entry.type === 'break_end' && breakStart) {
                breakDuration += (entry.timestamp.getTime() - breakStart.getTime()) / (1000 * 60);
                breakStart = null;
              }
            });

            return {
              date: new Date(day.work_date).toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
              }),
              clock_in: clockIn ? clockIn.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '',
              clock_out: clockOut ? clockOut.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '',
              break_duration: breakDuration > 0 ? `${Math.floor(breakDuration / 60)}:${(breakDuration % 60).toString().padStart(2, '0')}` : '',
              total_hours: day.total_hours
            };
          });

          reportData = [{
            employee: {
              fiscal_name: employee.fiscal_name,
              email: employee.email,
              work_centers: employee.work_centers,
              delegation: employee.delegation,
              document_number: employee.document_number
            },
            date: startDate,
            entry_type: '',
            timestamp: '',
            daily_reports: dailyReports
          }];
          break;
        }

        case 'general': {
          // Get daily work hours for all matching employees
          const { data: dailyHours } = await supabase
            .from('daily_work_hours')
            .select('*')
            .in('employee_id', employees.map(emp => emp.id))
            .gte('work_date', startDate)
            .lte('work_date', endDate)
            .order('work_date', { ascending: true });

          if (!dailyHours) break;

          reportData = dailyHours.flatMap(day => {
            const employee = employees.find(emp => emp.id === day.employee_id);
            if (!employee) return [];

            return day.timestamps.map((ts: string, i: number) => ({
              employee: {
                fiscal_name: employee.fiscal_name,
                email: employee.email,
                work_centers: employee.work_centers,
                delegation: employee.delegation,
                document_number: employee.document_number
              },
              date: new Date(day.work_date).toLocaleDateString(),
              entry_type: day.entry_types[i],
              timestamp: new Date(ts).toLocaleTimeString(),
              work_center: day.work_centers[i],
              total_hours: day.total_hours
            }));
          });
          break;
        }

        case 'alarms': {
          // Get daily work hours for all matching employees
          const { data: dailyHours } = await supabase
            .from('daily_work_hours')
            .select('*')
            .in('employee_id', employees.map(emp => emp.id))
            .gte('work_date', startDate)
            .lte('work_date', endDate);

          if (!dailyHours) break;

          // Group by employee and calculate total hours
          const employeeHours = dailyHours.reduce((acc, day) => {
            const employee = employees.find(emp => emp.id === day.employee_id);
            if (!employee) return acc;

            if (!acc[day.employee_id]) {
              acc[day.employee_id] = {
                employee: {
                  fiscal_name: employee.fiscal_name,
                  email: employee.email,
                  work_centers: employee.work_centers,
                  delegation: employee.delegation,
                  document_number: employee.document_number
                },
                total_hours: 0
              };
            }
            acc[day.employee_id].total_hours += day.total_hours;
            return acc;
          }, {} as Record<string, { employee: Report['employee']; total_hours: number; }>);

          // Filter employees who exceeded the hours limit
          reportData = Object.values(employeeHours)
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
          ''
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
        'Delegación': report.employee.delegation,
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
            onClick={() => setReportType('general')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              reportType === 'general'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <FileText className="w-5 h-5" />
            Listado General
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delegación
                  </label>
                  <select
                    value={selectedDelegation}
                    onChange={(e) => setSelectedDelegation(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Todas las delegaciones</option>
                    {delegations.map((delegation) => (
                      <option key={delegation} value={delegation}>
                        {delegation}
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
                    Delegación
                  </th>
                  {reportType === 'general' ? (
                    <>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fecha
                      </th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Hora
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
                    <td colSpan={7} className="px-6 py-4 text-center">
                      Cargando...
                    </td>
                  </tr>
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center">
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        {report.employee.delegation}
                      </td>
                      {reportType === 'general' ? (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {report.date}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {report.entry_type}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {report.timestamp}
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
        )}
      </div>
    </div>
  );
}