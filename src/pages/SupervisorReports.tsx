import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, Search, FileText, Clock } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface Report {
  employee: {
    fiscal_name: string;
    email: string;
    work_center: string;
  };
  date: string;
  entry_type: string;
  timestamp: string;
  total_hours?: number;
  entries?: {
    date: string;
    entry_type: string;
    timestamp: string;
  }[];
}

export default function SupervisorReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reportType, setReportType] = useState<'general' | 'hours' | 'official'>('general');
  const [searchTerm, setSearchTerm] = useState('');
  const [supervisorWorkCenter, setSupervisorWorkCenter] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Recuperar el correo electrónico del localStorage
  const supervisorEmail = localStorage.getItem('supervisorEmail');

  useEffect(() => {
    const getSupervisorInfo = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Verificar si el correo electrónico del supervisor está disponible
        if (!supervisorEmail) {
          throw new Error('No se encontró el correo electrónico del supervisor');
        }

        // Obtener los centros de trabajo del supervisor usando su correo electrónico
        const { data: workCenters, error: workCentersError } = await supabase
          .rpc('get_supervisor_work_centers', {
            p_email: supervisorEmail, // Usar el correo electrónico del supervisor
          });

        if (workCentersError) {
          throw workCentersError;
        }

        if (!workCenters?.length) {
          throw new Error('No se encontraron centros de trabajo asignados');
        }

        setSupervisorWorkCenter(workCenters[0]); // Establecer el primer centro de trabajo

        // Obtener los empleados asociados a los centros de trabajo del supervisor
        const { data: employeesData, error: employeesError } = await supabase
          .rpc('get_supervisor_center_employees_v6', {
            p_email: supervisorEmail,
          });

        if (employeesError) {
          throw employeesError;
        }

        setEmployees(employeesData || []);
      } catch (err) {
        console.error('Error obteniendo la información del supervisor:', err);
        setError(err instanceof Error ? err.message : 'Error al cargar los datos');
      } finally {
        setIsLoading(false);
      }
    };

    getSupervisorInfo();
  }, [supervisorEmail]);

  useEffect(() => {
    if (supervisorWorkCenter) {
      generateReport();
    }
  }, [reportType, searchTerm, supervisorWorkCenter, startDate, endDate, selectedEmployee]);

  const generateReport = async () => {
    if (!startDate || !endDate) return;
    setIsLoading(true);

    try {
      // Filtrar empleados del centro de trabajo del supervisor
      const workCenterEmployees = employees.filter((emp) =>
        emp.work_centers.includes(supervisorWorkCenter)
      );

      let reportData: Report[] = [];

      switch (reportType) {
        case 'general':
          // Obtener horas de trabajo diarias para todos los empleados
          const { data: dailyHours } = await supabase
            .from('daily_work_hours')
            .select('*')
            .in('employee_id', workCenterEmployees.map((emp) => emp.id))
            .gte('work_date', startDate)
            .lte('work_date', endDate)
            .order('work_date', { ascending: true });

          if (!dailyHours) break;

          reportData = dailyHours.flatMap((day) => {
            const employee = workCenterEmployees.find((emp) => emp.id === day.employee_id);
            if (!employee) return [];

            return day.timestamps.map((ts: string, i: number) => ({
              employee: {
                fiscal_name: employee.fiscal_name,
                email: employee.email,
                work_center: supervisorWorkCenter,
              },
              date: new Date(day.work_date).toLocaleDateString(),
              entry_type: day.entry_types[i],
              timestamp: new Date(ts).toLocaleTimeString(),
              total_hours: day.total_hours,
            }));
          });
          break;

        case 'hours':
          reportData = workCenterEmployees.map((emp) => {
            const employeeEntries = dailyHours?.filter((day) => day.employee_id === emp.id) || [];
            const totalHours = employeeEntries.reduce((acc, day) => acc + day.total_hours, 0);

            return {
              employee: {
                fiscal_name: emp.fiscal_name,
                email: emp.email,
                work_center: supervisorWorkCenter,
              },
              date: '-',
              entry_type: '-',
              timestamp: '-',
              total_hours: Math.round(totalHours * 100) / 100,
            };
          });
          break;

        case 'official':
          if (!selectedEmployee || !startDate || !endDate) break;

          const employee = workCenterEmployees.find((emp) => emp.id === selectedEmployee);
          if (!employee) break;

          // Obtener todas las entradas para el empleado seleccionado en el rango de fechas
          const { data: officialEntries } = await supabase
            .from('daily_work_hours')
            .select('*')
            .eq('employee_id', selectedEmployee)
            .gte('work_date', startDate)
            .lte('work_date', endDate)
            .order('work_date', { ascending: true });

          if (!officialEntries) break;

          reportData = officialEntries.map((day) => ({
            employee: {
              fiscal_name: employee.fiscal_name,
              email: employee.email,
              work_center: supervisorWorkCenter,
            },
            date: new Date(day.work_date).toLocaleDateString(),
            entry_type: '-',
            timestamp: '-',
            total_hours: day.total_hours,
            entries: day.timestamps.map((ts: string, i: number) => ({
              date: new Date(day.work_date).toLocaleDateString(),
              entry_type: day.entry_types[i],
              timestamp: new Date(ts).toLocaleTimeString(),
            })),
          }));
          break;
      }

      setReports(reportData);
    } catch (error) {
      console.error('Error generando el informe:', error);
      setError('Error al generar el informe');
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

      const employee = employees.find((emp) => emp.id === selectedEmployee);
      if (!employee) return;

      // Generar PDF
      const doc = new jsPDF();

      // Título
      doc.setFontSize(14);
      doc.text('Listado mensual del registro de jornada', 105, 20, { align: 'center' });

      // Información de la empresa y el empleado
      doc.setFontSize(10);
      const tableData = [
        ['Empresa: CONTROLALTSUP S.L.', `Trabajador: ${employee.fiscal_name}`],
        ['C.I.F/N.I.F: B87304283', `N.I.F: ${employee.document_number}`],
        [`Centro de Trabajo: ${supervisorWorkCenter}`, `Nº Afiliación: 281204329001`],
        ['C.C.C:', `Mes y Año: ${new Date(startDate).toLocaleDateString('es-ES', { month: '2-digit', year: 'numeric' })}`],
      ];

      doc.autoTable({
        startY: 30,
        head: [],
        body: tableData,
        theme: 'plain',
        styles: {
          cellPadding: 2,
          fontSize: 10,
        },
        columnStyles: {
          0: { cellWidth: 95 },
          1: { cellWidth: 95 },
        },
      });

      // Registros diarios
      const recordsData = reports.map((report) => {
        const dayEntries = report.entries || [];
        const clockIn = dayEntries.find((e) => e.entry_type === 'clock_in');
        const clockOut = dayEntries.find((e) => e.entry_type === 'clock_out');
        const hasBreak = dayEntries.some((e) => e.entry_type === 'break_start');

        return [
          report.date,
          clockIn?.timestamp || '',
          clockOut?.timestamp || '',
          hasBreak ? '1:00' : '',
          report.total_hours
            ? `${Math.floor(report.total_hours)}:${Math.round((report.total_hours % 1) * 60)
                .toString()
                .padStart(2, '0')}`
            : '',
        ];
      });

      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 10,
        head: [['DIA', 'ENTRADA', 'SALIDA', 'PAUSAS', 'HORAS ORDINARIAS']],
        body: recordsData,
        theme: 'grid',
        styles: {
          cellPadding: 2,
          fontSize: 8,
          halign: 'center',
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 35 },
          2: { cellWidth: 35 },
          3: { cellWidth: 35 },
          4: { cellWidth: 35 },
        },
      });

      // Total de horas
      const totalHours = reports.reduce((acc, curr) => acc + (curr.total_hours || 0), 0);
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
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 35 },
          2: { cellWidth: 35 },
          3: { cellWidth: 35 },
          4: { cellWidth: 35 },
        },
      });

      // Firmas
      doc.setFontSize(10);
      doc.text('Firma de la Empresa:', 40, doc.lastAutoTable.finalY + 30);
      doc.text('Firma del Trabajador:', 140, doc.lastAutoTable.finalY + 30);

      // Lugar y fecha
      doc.setFontSize(8);
      doc.text(
        `En Madrid, a ${new Date().toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}`,
        14,
        doc.lastAutoTable.finalY + 60
      );

      // Nota legal
      doc.setFontSize(6);
      const legalText =
        'Registro realizado en cumplimiento del Real Decreto-ley 8/2019, de 8 de marzo, de medidas urgentes de protección social y de lucha contra la precariedad laboral en la jornada de trabajo ("BOE" núm. 61 de 12 de marzo), la regulación de forma expresa en el artículo 34 del texto refundido de la Ley del Estatuto de los Trabajadores (ET), la obligación de las empresas de registrar diariamente la jornada laboral.';
      doc.text(legalText, 14, doc.lastAutoTable.finalY + 70, {
        maxWidth: 180,
        align: 'justify',
      });

      doc.save(`informe_oficial_${employee.fiscal_name}_${startDate}.pdf`);
      return;
    }

    // Exportar a Excel para otros tipos de informe
    const exportData = reports.map((report) => ({
      Nombre: report.employee.fiscal_name,
      Email: report.employee.email,
      'Centro de Trabajo': report.employee.work_center,
      Fecha: report.date,
      Tipo: report.entry_type,
      Hora: report.timestamp,
      ...(report.total_hours ? { 'Horas Totales': report.total_hours } : {}),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Informe');

    const reportName = `informe_${reportType}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, reportName);
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Informes</h1>
          <p className="text-gray-600">Centro de Trabajo: {supervisorWorkCenter}</p>
        </div>

        {/* Selección del tipo de informe */}
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
            onClick={() => setReportType('hours')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              reportType === 'hours'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Clock className="w-5 h-5" />
            Horas por Trabajador
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
        </div>
                
        {/* Filters */}
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Empleado
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Buscar..."
                  />
                </div>
              </div>
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

        {/* Export Button */}
        <div className="mb-6">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-5 h-5" />
            {reportType === 'official' ? 'Generar PDF' : 'Exportar a Excel'}
          </button>
        </div>

        {/* Report Table */}
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
                    Centro de Trabajo
                  </th>
                  {reportType !== 'hours' && (
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
                  )}
                  {reportType === 'hours' && (
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Horas Totales
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center">
                      Cargando...
                    </td>
                  </tr>
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center">
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
                        {report.employee.work_center}
                      </td>
                      {reportType !== 'hours' && (
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
                      )}
                      {reportType === 'hours' && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          {report.total_hours} h
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