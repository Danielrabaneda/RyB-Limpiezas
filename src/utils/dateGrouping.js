import { format, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';

export function getGroupInfo(date) {
  if (!date) return null;
  const dateObj = date.toDate ? date.toDate() : new Date(date);
  if (isNaN(dateObj.getTime())) return null;

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth(); // 0-indexed

  const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 });
  
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth();

  if (year < todayYear) {
    // Completed year
    return {
      groupKey: `year_${year}`,
      type: 'year',
      label: `Año ${year}`,
      subLabel: 'Año Finalizado',
      isCurrent: false,
      sortDate: new Date(year, 11, 31) // End of that year for sorting
    };
  } else if (month < todayMonth) {
    // Completed month of the current year
    const monthName = format(dateObj, 'MMMM yyyy', { locale: es });
    const capitalizedLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return {
      groupKey: `month_${year}_${month}`,
      type: 'month',
      label: capitalizedLabel,
      subLabel: 'Mes Finalizado',
      isCurrent: false,
      sortDate: new Date(year, month, 28) // Near end of that month
    };
  } else {
    // Current month of the current year (or future)
    const start = startOfWeek(dateObj, { weekStartsOn: 1 });
    const end = endOfWeek(dateObj, { weekStartsOn: 1 });
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    const isCurrentWeek = start.getTime() === startOfCurrentWeek.getTime();
    
    return {
      groupKey: `week_${startStr}_${endStr}`,
      type: 'week',
      label: `Semana ${format(start, 'dd/MM')} - ${format(end, 'dd/MM')}`,
      subLabel: isCurrentWeek ? 'Esta Semana' : 'Semana Finalizada',
      isCurrent: isCurrentWeek,
      sortDate: start // Start of week for sorting
    };
  }
}

export function groupFlatList(items, getDateFn) {
  if (!items || !Array.isArray(items)) return [];
  
  const groups = {};

  items.forEach(item => {
    const d = getDateFn(item);
    if (!d) return;
    
    const info = getGroupInfo(d);
    if (!info) return;

    if (!groups[info.groupKey]) {
      groups[info.groupKey] = {
        id: info.groupKey,
        key: info.groupKey,
        type: info.type,
        label: info.label,
        subLabel: info.subLabel,
        isCurrent: info.isCurrent,
        sortDate: info.sortDate,
        items: []
      };
    }
    groups[info.groupKey].items.push(item);
  });

  return Object.values(groups).sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
}
