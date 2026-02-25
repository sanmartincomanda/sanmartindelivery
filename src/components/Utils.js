export const normalizar = (s = '') => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
export const hoyISO = () => new Date().toISOString().slice(0, 10);

export const exportarAExcel = (pedidos) => {
  const rows = pedidos.filter(p => p.estado !== 'Cancelado').map(p => [
    p.fecha, p.id, p.cliente, p.clienteCodigo || '-', p.direccion || '-', 
    (p.pedido || '').replace(/\n/g, ' '), p.estado, p.timestampIngreso || '-', 
    p.timestampPreparacion || '-', p.timestampPreparado || '-', p.timestampEnviado || '-', 
    p.cocinero || '-', p.repartidor || '-'
  ]);
  const header = ['Fecha', '#', 'Cliente', 'Código Cliente', 'Dirección', 'Pedido', 'Estado', 'Ingreso', 'Preparación', 'Preparado', 'Enviado', 'Cocinero', 'Repartidor'];
  let htmlContent = '<table border="1"><tr>' + header.map(col => `<th>${col}</th>`).join('') + '</tr>';
  rows.forEach(r => { htmlContent += '<tr>' + r.map(val => `<td>${val}</td>`).join('') + '</tr>'; });
  htmlContent += '</table>';
  const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'historial_pedidos.xls';
  link.click();
};