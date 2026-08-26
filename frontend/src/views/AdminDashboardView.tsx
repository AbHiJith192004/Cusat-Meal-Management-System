import React, { useState, useEffect } from 'react';
import { ActiveTab } from '../types';
import { adminApi } from '../services/api';
import { CreateAdminModal } from '../components/CreateAdminModal';

interface AdminDashboardViewProps {
  onNavigate: (tab: ActiveTab) => void;
  initialModuleTab?: AdminModuleTab;
}

type AdminModuleTab = 'daily-summary' | 'weekly-menu' | 'ledger' | 'student-data' | 'billing' | 'payments' | 'stocks';
type LedgerSubTab = 'food-purchases' | 'operational-expenses' | 'admin-expenses' | 'inventory';

interface DrillDownState {
  isOpen: boolean;
  mealType: string;
  mealTitle: string;
  category: 'TOTAL' | 'SERVED' | 'SKIPPED' | 'PENDING' | 'FINED' | 'NOT_ELIGIBLE';
  categoryLabel: string;
  colorHex: string;
  count: number;
}

// Weekly Menu Initial Data
const INITIAL_WEEKLY_MENU = [
  {
    day: 'Monday',
    breakfast: 'Appam & Veg Stew / Egg Curry + Tea',
    lunch: 'Kerala Meals, Avial, Fish Curry / Pulissery',
    dinner: 'Chapati, Chicken Curry / Paneer Butter Masala + Milk',
    tag: 'REGULAR',
  },
  {
    day: 'Tuesday',
    breakfast: 'Idli, Sambar & Coconut Chutney + Coffee',
    lunch: 'Kerala Meals, Thoran, Sambhar & Moru Curry',
    dinner: 'Puri, Masala Curry & Curd Rice + Tea',
    tag: 'VEG_SPECIAL',
  },
  {
    day: 'Wednesday',
    breakfast: 'Dosa, Sambar & Tomato Chutney + Tea',
    lunch: 'Kerala Meals, Fish Fry, Kalan & Rasam',
    dinner: 'Malabar Parotta & Beef Roast / Mushroom Masala',
    tag: 'NON_VEG_SPECIAL',
  },
  {
    day: 'Thursday',
    breakfast: 'Puttu & Kadala Curry + Tea',
    lunch: 'Kerala Meals, Erissery, Pulissery & Curd',
    dinner: 'Wheat Dosa, Tomato Chutney & Vegetable Stew',
    tag: 'REGULAR',
  },
  {
    day: 'Friday',
    breakfast: 'Poori & Potato Masala + Coffee',
    lunch: 'CUSAT Chicken Biryani / Veg Dum Biryani & Raita',
    dinner: 'Chapati & Egg Roast / Dal Tadka + Milk',
    tag: 'FEAST_SPECIAL',
  },
  {
    day: 'Saturday',
    breakfast: 'Upma & Banana + Tea/Coffee',
    lunch: 'Kerala Meals, Olan, Pachadi & Fish Curry',
    dinner: 'Fried Rice & Gobi Manchurian / Chili Chicken',
    tag: 'CHINESE_SPECIAL',
  },
  {
    day: 'Sunday',
    breakfast: 'Ghee Dosa & Potato Stew + Coffee',
    lunch: 'Special Kerala Sadhya, Payasam, Boli & Avial',
    dinner: 'Chapati & Chicken Stew / Mixed Veg Curry + Tea',
    tag: 'SUNDAY_FEAST',
  },
];

// Initial Food Purchases Data
const INITIAL_FOOD_PURCHASES = [
  { id: '1', date: '2026-08-13', item: 'Ponni Rice (50kg Bags x4)', qty: '200 kg', amount: 9800, month: 'August', year: '2026' },
  { id: '2', date: '2026-08-13', item: 'Toned Milk (Milma 1L Pouches x80)', qty: '80 L', amount: 4160, month: 'August', year: '2026' },
  { id: '3', date: '2026-08-12', item: 'Grade A Eggs (Crates x10)', qty: '300 pcs', amount: 1800, month: 'August', year: '2026' },
  { id: '4', date: '2026-08-12', item: 'Fresh Broiler Chicken', qty: '45 kg', amount: 8550, month: 'August', year: '2026' },
  { id: '5', date: '2026-08-11', item: 'Refined Sunflower Oil (15L Tins x3)', qty: '45 L', amount: 5850, month: 'August', year: '2026' },
  { id: '6', date: '2026-08-10', item: 'Onions & Potatoes (Bulk Mix)', qty: '120 kg', amount: 3600, month: 'August', year: '2026' },
  { id: '7', date: '2026-07-28', item: 'Atta / Wheat Flour (10kg Packs x10)', qty: '100 kg', amount: 4200, month: 'July', year: '2026' },
  { id: '8', date: '2026-07-25', item: 'Toor Dal & Chana Dal Mix', qty: '60 kg', amount: 7200, month: 'July', year: '2026' },
  { id: '9', date: '2025-12-15', item: 'Spices Mix (Turmeric, Chili, Coriander)', qty: '25 kg', amount: 6500, month: 'December', year: '2025' },
];

// Initial Operational Expenses Data
const INITIAL_OP_EXPENSES = [
  { id: 'op-1', date: '2026-08-12', title: 'Indane Commercial LPG Cylinders Refill', category: 'Gas/Fuel', amount: 7400 },
  { id: 'op-2', date: '2026-08-10', title: 'Diesel for Mess Backup Generator', category: 'Gas/Fuel', amount: 3500 },
  { id: 'op-3', date: '2026-08-08', title: 'Kitchen Exhaust Hood Filter Cleaning & Maintenance', category: 'Miscellaneous', amount: 2800 },
  { id: 'op-4', date: '2026-08-05', title: 'Pest Control & Sanitation Spraying', category: 'Miscellaneous', amount: 1800 },
  { id: 'op-5', date: '2026-07-28', title: 'LPG Pipeline Safety Leak Pressure Test', category: 'Gas/Fuel', amount: 1500 },
];

interface AdminExpenseMonthRecord {
  id: string;
  month: string;
  year: string;
  salary: number;
  allowance: number;
  stationary: number;
  misc: number;
}

// Initial Administrative Expenses Data (Month-wise)
const INITIAL_ADMIN_EXPENSES_MONTHLY: AdminExpenseMonthRecord[] = [
  { id: 'ad-aug-2026', month: 'August', year: '2026', salary: 85000, allowance: 12000, stationary: 2500, misc: 3800 },
  { id: 'ad-jul-2026', month: 'July', year: '2026', salary: 85000, allowance: 12000, stationary: 1800, misc: 2900 },
  { id: 'ad-jun-2026', month: 'June', year: '2026', salary: 82000, allowance: 10000, stationary: 3100, misc: 4200 },
  { id: 'ad-may-2026', month: 'May', year: '2026', salary: 82000, allowance: 10000, stationary: 1500, misc: 2100 },
];

interface InventoryCatalogItem {
  id: string;
  name: string;
  unit: string;
}

// Initial Inventory Items Catalogue Data
const INITIAL_INVENTORY_CATALOG: InventoryCatalogItem[] = [
  { id: 'inv-cat-1', name: 'Ponni Rice (50kg Bag)', unit: 'kg' },
  { id: 'inv-cat-2', name: 'Wheat Flour / Atta', unit: 'kg' },
  { id: 'inv-cat-3', name: 'Toned Milk (Milma)', unit: 'L' },
  { id: 'inv-cat-4', name: 'Grade A Eggs', unit: 'pcs' },
  { id: 'inv-cat-5', name: 'Fresh Broiler Chicken', unit: 'kg' },
  { id: 'inv-cat-6', name: 'Refined Sunflower Oil', unit: 'L' },
  { id: 'inv-cat-7', name: 'Onions & Potatoes', unit: 'kg' },
  { id: 'inv-cat-8', name: 'Toor Dal & Chana Dal', unit: 'kg' },
  { id: 'inv-cat-9', name: 'Spices Mix', unit: 'kg' },
  { id: 'inv-cat-10', name: 'Tea Powder (Kanan Devan)', unit: 'kg' },
  { id: 'inv-cat-11', name: 'Coffee Powder', unit: 'kg' },
  { id: 'inv-cat-12', name: 'Commercial LPG Cylinders', unit: 'cylinders' },
  { id: 'inv-cat-13', name: 'Sugar', unit: 'kg' },
  { id: 'inv-cat-14', name: 'Fresh Beef (Meat)', unit: 'kg' },
  { id: 'inv-cat-15', name: 'Green Beans & Vegetables', unit: 'kg' },
  { id: 'inv-cat-16', name: 'Butter (Milma / Amul)', unit: 'kg' },
  { id: 'inv-cat-17', name: 'Banana (Nendran / Robusta)', unit: 'kg' },
  { id: 'inv-cat-18', name: 'Brinjal & Eggplant', unit: 'kg' },
  { id: 'inv-cat-19', name: 'Fresh Bread Loaves', unit: 'packs' },
  { id: 'inv-cat-20', name: 'Basmati Rice (Biryani Grade)', unit: 'kg' },
];

interface MasterStudentDetail {
  id: string;
  photo: string;
  messId: string;
  name: string;
  regNo: string;
  dietaryPref: 'Veg' | 'Non-Veg';
  category: 'Inmate' | 'Lakeside' | 'Outmess';
  upcomingMealStatus: 'OPTED_IN' | 'SKIPPED' | 'PENDING';
  department: string;
  email: string;
  roomNo: string;
  daysOptedIn: number;
  messCutsTaken: number;
  finesReceived: number;
}

// Initial Master Student Directory Data
const INITIAL_MASTER_STUDENTS: MasterStudentDetail[] = [
  {
    id: '1',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
    messId: 'M-TEST001',
    name: 'Abhijith S',
    regNo: 'TEST001',
    dietaryPref: 'Non-Veg',
    category: 'Inmate',
    upcomingMealStatus: 'OPTED_IN',
    department: 'Computer Science & Engineering',
    email: 'abhijith.s@cusat.ac.in',
    roomNo: 'Room 304, Sanathana Hostel Block A',
    daysOptedIn: 24,
    messCutsTaken: 3,
    finesReceived: 30,
  },
  {
    id: '2',
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=250',
    messId: 'M-2023002',
    name: 'Aswin Kumar',
    regNo: '2023002',
    dietaryPref: 'Veg',
    category: 'Lakeside',
    upcomingMealStatus: 'PENDING',
    department: 'Mechanical Engineering',
    email: 'aswin.kumar@cusat.ac.in',
    roomNo: 'Room 112, Lakeside Hostel Block B',
    daysOptedIn: 28,
    messCutsTaken: 1,
    finesReceived: 0,
  },
  {
    id: '3',
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=250',
    messId: 'M-2023003',
    name: 'Meera Pillai',
    regNo: '2023003',
    dietaryPref: 'Veg',
    category: 'Inmate',
    upcomingMealStatus: 'SKIPPED',
    department: 'Electronics & Communication',
    email: 'meera.pillai@cusat.ac.in',
    roomNo: 'Room 205, Ananya Girls Hostel',
    daysOptedIn: 21,
    messCutsTaken: 5,
    finesReceived: 0,
  },
  {
    id: '4',
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=250',
    messId: 'M-2023004',
    name: 'Rohit Menon',
    regNo: '2023004',
    dietaryPref: 'Non-Veg',
    category: 'Outmess',
    upcomingMealStatus: 'OPTED_IN',
    department: 'Civil Engineering',
    email: 'rohit.menon@cusat.ac.in',
    roomNo: 'Outmess / Off-Campus Day Scholar',
    daysOptedIn: 25,
    messCutsTaken: 2,
    finesReceived: 60,
  },
  {
    id: '5',
    photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=250',
    messId: 'M-2023005',
    name: 'Sneha Joseph',
    regNo: '2023005',
    dietaryPref: 'Veg',
    category: 'Inmate',
    upcomingMealStatus: 'PENDING',
    department: 'Information Technology',
    email: 'sneha.joseph@cusat.ac.in',
    roomNo: 'Room 108, Ananya Girls Hostel',
    daysOptedIn: 29,
    messCutsTaken: 0,
    finesReceived: 0,
  },
  {
    id: '6',
    photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=250',
    messId: 'M-2023006',
    name: 'Vishnu Das',
    regNo: '2023006',
    dietaryPref: 'Non-Veg',
    category: 'Lakeside',
    upcomingMealStatus: 'SKIPPED',
    department: 'Safety & Fire Engineering',
    email: 'vishnu.das@cusat.ac.in',
    roomNo: 'Room 401, Lakeside Hostel Block A',
    daysOptedIn: 22,
    messCutsTaken: 4,
    finesReceived: 30,
  },
];

// Initial Inventory Master Data
const INITIAL_INVENTORY = [
  { id: 'inv-1', name: 'Ponni Rice', category: 'Grains & Pulses', stock: 350, unit: 'kg', minLevel: 100, status: 'IN_STOCK', lastRestocked: '2026-08-13' },
  { id: 'inv-2', name: 'Wheat Flour / Atta', category: 'Grains & Pulses', stock: 80, unit: 'kg', minLevel: 100, status: 'LOW_STOCK', lastRestocked: '2026-07-28' },
  { id: 'inv-3', name: 'Refined Sunflower Oil', category: 'Oil & Spices', stock: 65, unit: 'L', minLevel: 30, status: 'IN_STOCK', lastRestocked: '2026-08-11' },
  { id: 'inv-4', name: 'Commercial LPG Cylinders', category: 'Gas & Fuel', stock: 6, unit: 'cylinders', minLevel: 4, status: 'IN_STOCK', lastRestocked: '2026-08-12' },
  { id: 'inv-5', name: 'Grade A Eggs', category: 'Dairy & Eggs', stock: 240, unit: 'pcs', minLevel: 100, status: 'IN_STOCK', lastRestocked: '2026-08-12' },
  { id: 'inv-6', name: 'Tea Powder (Kanan Devan)', category: 'Beverages', stock: 8, unit: 'kg', minLevel: 15, status: 'LOW_STOCK', lastRestocked: '2026-07-20' },
  { id: 'inv-7', name: 'Toor Dal', category: 'Grains & Pulses', stock: 45, unit: 'kg', minLevel: 50, status: 'LOW_STOCK', lastRestocked: '2026-07-25' },
];

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  onNavigate,
  initialModuleTab = 'daily-summary',
}) => {
  const [activeModuleTab, setActiveModuleTab] = useState<AdminModuleTab>(initialModuleTab);

  useEffect(() => {
    if (initialModuleTab) {
      setActiveModuleTab(initialModuleTab);
    }
  }, [initialModuleTab]);

  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Quick Action Modals
  const [showExportModal, setShowExportModal] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showCreateAdminModal, setShowCreateAdminModal] = useState(false);

  // Form states
  const [holidayDate, setHolidayDate] = useState(new Date().toISOString().split('T')[0]);
  const [holidayReason, setHolidayReason] = useState('');
  const [manualStudentId, setManualStudentId] = useState('');
  const [manualMealType, setManualMealType] = useState('LUNCH');
  const [manualReason, setManualReason] = useState('Admin manual entry');

  // Weekly Menu State
  const [weeklyMenu, setWeeklyMenu] = useState(INITIAL_WEEKLY_MENU);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [editingDayMenu, setEditingDayMenu] = useState<any>(null);

  // -------------------------------------------------------------
  // LEDGER / ACCOUNTS MODULE STATE (4 Sub Navigation Tabs)
  // -------------------------------------------------------------
  const [ledgerSubTab, setLedgerSubTab] = useState<LedgerSubTab>('food-purchases');

  // 1. Food Purchases State & Logging Form
  const [foodPurchases, setFoodPurchases] = useState(INITIAL_FOOD_PURCHASES);
  const [foodItem, setFoodItem] = useState(INITIAL_INVENTORY_CATALOG[0]?.name || '');
  const [foodDate, setFoodDate] = useState(new Date().toISOString().split('T')[0]);
  const [foodQty, setFoodQty] = useState('');
  const [foodAmount, setFoodAmount] = useState('');
  const [foodSearch, setFoodSearch] = useState('');
  const [foodMonthFilter, setFoodMonthFilter] = useState('ALL');
  const [foodYearFilter, setFoodYearFilter] = useState('ALL');

  // 2. Operational Expenses State & Form
  const [opExpenses, setOpExpenses] = useState(INITIAL_OP_EXPENSES);
  const [opDate, setOpDate] = useState(new Date().toISOString().split('T')[0]);
  const [opTitle, setOpTitle] = useState('');
  const [opCategory, setOpCategory] = useState<'Gas/Fuel' | 'Miscellaneous'>('Gas/Fuel');
  const [opAmount, setOpAmount] = useState('');

  // 3. Administrative Expenses State & Form
  const [adminMonthlyExpenses, setAdminMonthlyExpenses] = useState<AdminExpenseMonthRecord[]>(INITIAL_ADMIN_EXPENSES_MONTHLY);
  const [adminBillMonth, setAdminBillMonth] = useState('August');
  const [adminBillYear, setAdminBillYear] = useState('2026');
  const [adminSalary, setAdminSalary] = useState('');
  const [adminAllowance, setAdminAllowance] = useState('');
  const [adminStationary, setAdminStationary] = useState('');
  const [adminMisc, setAdminMisc] = useState('');

  // 4. Inventory Catalogue State & Form
  const [inventoryCatalog, setInventoryCatalog] = useState<InventoryCatalogItem[]>(INITIAL_INVENTORY_CATALOG);
  const [newInvName, setNewInvName] = useState('');
  const [newInvUnit, setNewInvUnit] = useState('kg');
  const [invSearch, setInvSearch] = useState('');
  const [showClosingSuggestions, setShowClosingSuggestions] = useState(false);

  // Student Data Filter State
  const [studentSearch, setStudentSearch] = useState('');
  const [studentCampusFilter, setStudentCampusFilter] = useState('ALL');

  // Master Student Directory & Detail Modal State
  const [masterStudents, setMasterStudents] = useState<MasterStudentDetail[]>(INITIAL_MASTER_STUDENTS);
  const [activeMasterStudent, setActiveMasterStudent] = useState<MasterStudentDetail | null>(null);
  const [editDietaryPref, setEditDietaryPref] = useState<'Veg' | 'Non-Veg'>('Non-Veg');
  const [editCategory, setEditCategory] = useState<'Inmate' | 'Lakeside' | 'Outmess'>('Inmate');

  const handleOpenMasterStudentModal = (student: MasterStudentDetail) => {
    setActiveMasterStudent(student);
    setEditDietaryPref(student.dietaryPref);
    setEditCategory(student.category);
  };

  const handleSaveStudentChanges = () => {
    if (!activeMasterStudent) return;
    const updated = masterStudents.map((s) =>
      s.id === activeMasterStudent.id
        ? { ...s, dietaryPref: editDietaryPref, category: editCategory }
        : s
    );
    setMasterStudents(updated);
    setActiveMasterStudent({
      ...activeMasterStudent,
      dietaryPref: editDietaryPref,
      category: editCategory,
    });
    alert(`Admin changes for ${activeMasterStudent.name} saved successfully!`);
  };

  // 5. Billing Module State & Math Calculations
  const [billingMonth, setBillingMonth] = useState('August');
  const [billingYear, setBillingYear] = useState('2026');
  const [openingStockMap, setOpeningStockMap] = useState<Record<string, number>>({
    'August-2026': 15000,
    'July-2026': 12000,
    'June-2026': 14000,
  });
  const [closingStockMap, setClosingStockMap] = useState<Record<string, number>>({
    'August-2026': 12000,
    'July-2026': 10000,
    'June-2026': 11500,
  });
  const [chargeableDaysMap] = useState<Record<string, number>>({
    'August-2026': 2850,
    'July-2026': 3100,
    'June-2026': 2980,
  });

  // Billing Line Item Modal State
  const [billingModal, setBillingModal] = useState<{
    isOpen: boolean;
    title: string;
    type: 'FOOD' | 'GAS' | 'ADMIN' | 'STOCK';
  }>({
    isOpen: false,
    title: '',
    type: 'FOOD',
  });

  // Stock Item Valuation Interface
  interface StockValuationItem {
    id: string;
    itemName: string;
    qty: number;
    wacPrice: number;
  }

  const [openingStockItems, setOpeningStockItems] = useState<StockValuationItem[]>([
    { id: 'op-1', itemName: 'Ponni Rice', qty: 100, wacPrice: 40 },
    { id: 'op-2', itemName: 'Toned Milk (Milma)', qty: 100, wacPrice: 52 },
    { id: 'op-3', itemName: 'Grade A Eggs', qty: 400, wacPrice: 6 },
    { id: 'op-4', itemName: 'Refined Sunflower Oil', qty: 20, wacPrice: 170 },
    { id: 'op-5', itemName: 'Wheat Flour / Atta', qty: 50, wacPrice: 40 },
  ]);

  const [closingStockItems, setClosingStockItems] = useState<StockValuationItem[]>([
    { id: 'cl-1', itemName: 'Ponni Rice', qty: 80, wacPrice: 40 },
    { id: 'cl-2', itemName: 'Toned Milk (Milma)', qty: 40, wacPrice: 52 },
    { id: 'cl-3', itemName: 'Grade A Eggs', qty: 200, wacPrice: 6 },
    { id: 'cl-4', itemName: 'Refined Sunflower Oil', qty: 15, wacPrice: 170 },
    { id: 'cl-5', itemName: 'Spices Mix', qty: 10, wacPrice: 317 },
  ]);

  // Form state for adding closing stock items
  const [newClosingName, setNewClosingName] = useState('');
  const [newClosingQty, setNewClosingQty] = useState('');
  const [newClosingWac, setNewClosingWac] = useState('');

  const handleAddClosingStockItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClosingName || !newClosingQty || !newClosingWac) {
      return alert('Please enter item name, quantity, and WAC price.');
    }
    const newItem: StockValuationItem = {
      id: `cl-${Date.now()}`,
      itemName: newClosingName.trim(),
      qty: parseFloat(newClosingQty),
      wacPrice: parseFloat(newClosingWac),
    };
    setClosingStockItems([...closingStockItems, newItem]);
    setNewClosingName('');
    setNewClosingQty('');
    setNewClosingWac('');
    alert(`"${newItem.itemName}" added to Closing Stock catalogue.`);
  };

  const handleDeleteClosingStockItem = (id: string) => {
    if (window.confirm('Delete this closing stock item?')) {
      setClosingStockItems(prev => prev.filter(item => item.id !== id));
    }
  };

  // 6. Payments Module State & Handlers
  const [studentPaymentRecords, setStudentPaymentRecords] = useState<Array<{
    id: string;
    messId: string;
    name: string;
    category: 'Inmate' | 'Lakeside' | 'Outmess';
    department: string;
    month: string;
    year: string;
    foodBill: number;
    fineAmount: number;
    totalBill: number;
    status: 'PAID' | 'PENDING';
    utrRef: string;
    paidDate?: string;
  }>>([
    {
      id: 'pay-1',
      messId: 'MESS-2026-089',
      name: 'Rahul V Nair',
      category: 'Inmate',
      department: 'Computer Applications',
      month: 'August',
      year: '2026',
      foodBill: 2840,
      fineAmount: 100,
      totalBill: 2940,
      status: 'PAID',
      utrRef: 'UPI/429810293810',
      paidDate: '2026-08-05',
    },
    {
      id: 'pay-2',
      messId: 'MESS-2026-104',
      name: 'Ananya Sharma',
      category: 'Lakeside',
      department: 'Electronics & Comm',
      month: 'August',
      year: '2026',
      foodBill: 2650,
      fineAmount: 0,
      totalBill: 2650,
      status: 'PAID',
      utrRef: 'IMPS/981203912384',
      paidDate: '2026-08-06',
    },
    {
      id: 'pay-3',
      messId: 'MESS-2026-112',
      name: 'Muhammed Shafi',
      category: 'Inmate',
      department: 'Mechanical Engineering',
      month: 'August',
      year: '2026',
      foodBill: 2940,
      fineAmount: 150,
      totalBill: 3090,
      status: 'PENDING',
      utrRef: '',
    },
    {
      id: 'pay-4',
      messId: 'MESS-2026-145',
      name: 'Sneha P K',
      category: 'Outmess',
      department: 'Safety & Fire Tech',
      month: 'August',
      year: '2026',
      foodBill: 1890,
      fineAmount: 50,
      totalBill: 1940,
      status: 'PAID',
      utrRef: 'NEFT/120938102938',
      paidDate: '2026-08-08',
    },
    {
      id: 'pay-5',
      messId: 'MESS-2026-178',
      name: 'Vishnu Prasad',
      category: 'Inmate',
      department: 'Civil Engineering',
      month: 'August',
      year: '2026',
      foodBill: 3100,
      fineAmount: 200,
      totalBill: 3300,
      status: 'PENDING',
      utrRef: '',
    },
    {
      id: 'pay-6',
      messId: 'MESS-2026-201',
      name: 'Devika Menon',
      category: 'Lakeside',
      department: 'Biotechnology',
      month: 'August',
      year: '2026',
      foodBill: 2700,
      fineAmount: 0,
      totalBill: 2700,
      status: 'PAID',
      utrRef: 'UPI/883920194820',
      paidDate: '2026-08-10',
    },
    {
      id: 'pay-7',
      messId: 'MESS-2026-215',
      name: 'Arjun K S',
      category: 'Inmate',
      department: 'Polymer Science',
      month: 'August',
      year: '2026',
      foodBill: 2940,
      fineAmount: 100,
      totalBill: 3040,
      status: 'PENDING',
      utrRef: '',
    },
    {
      id: 'pay-8',
      messId: 'MESS-2026-230',
      name: 'Lakshmi R',
      category: 'Inmate',
      department: 'Marine Engineering',
      month: 'August',
      year: '2026',
      foodBill: 2840,
      fineAmount: 0,
      totalBill: 2840,
      status: 'PAID',
      utrRef: 'UPI/772819203918',
      paidDate: '2026-08-11',
    },
  ]);

  // Publication state comes from the server, not localStorage. It used to live
  // in `cusat_published_bills_v2`, which meant each admin's browser had its own
  // private idea of whether a month was published - and therefore whether stock
  // was frozen. The server is the authority; this map is just a local cache of
  // what it said.
  const [isBillPublishedMap, setIsBillPublishedMap] = useState<Record<string, boolean>>({});
  const [billStatusLoading, setBillStatusLoading] = useState(false);

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const monthNumber = (name: string) => MONTH_NAMES.indexOf(name) + 1;

  const refreshBillStatus = async (monthName: string, yearStr: string) => {
    const m = monthNumber(monthName);
    const y = parseInt(yearStr, 10);
    if (m < 1 || Number.isNaN(y)) return;
    setBillStatusLoading(true);
    try {
      const res = await adminApi.getBillStatus(m, y);
      setIsBillPublishedMap(prev => ({ ...prev, [`${monthName}-${yearStr}`]: !!res.is_published }));
    } catch (e) {
      // Leave the cache untouched on failure rather than guessing a state that
      // controls whether financial records are editable.
    } finally {
      setBillStatusLoading(false);
    }
  };

  useEffect(() => {
    refreshBillStatus(billingMonth, billingYear);
  }, [billingMonth, billingYear]);

  const [paymentSearchQuery, setPaymentSearchQuery] = useState('');
  const [paymentCategoryFilter, setPaymentCategoryFilter] = useState<'ALL' | 'Inmate' | 'Lakeside' | 'Outmess'>('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');

  // 7. Stocks Module State & Data Structure
  const currentMonthNameStr = new Date().toLocaleString('en-US', { month: 'long' });
  const currentYearNumStr = new Date().getFullYear().toString();

  const [stocksMonth, setStocksMonth] = useState(currentMonthNameStr);
  const [stocksYear, setStocksYear] = useState(currentYearNumStr);
  const [stocksSearchPrefix, setStocksSearchPrefix] = useState('');
  const [billingStockSearchPrefix, setBillingStockSearchPrefix] = useState('');

  useEffect(() => {
    refreshBillStatus(stocksMonth, stocksYear);
  }, [stocksMonth, stocksYear]);

  // Physical Closing Stock Qty Map keyed by `${month}-${year}-${itemId}`
  const [physicalClosingStockMap, setPhysicalClosingStockMap] = useState<Record<string, number>>({
    'August-2026-inv-cat-1': 80,
    'August-2026-inv-cat-2': 45,
    'August-2026-inv-cat-3': 30,
    'August-2026-inv-cat-4': 50,
    'August-2026-inv-cat-5': 10,
    'August-2026-inv-cat-6': 15,
    'August-2026-inv-cat-7': 35,
    'August-2026-inv-cat-8': 25,
    'August-2026-inv-cat-9': 8,
    'July-2026-inv-cat-1': 100,
    'July-2026-inv-cat-2': 50,
    'July-2026-inv-cat-3': 40,
    'July-2026-inv-cat-4': 60,
    'July-2026-inv-cat-5': 12,
    'July-2026-inv-cat-6': 20,
    'July-2026-inv-cat-7': 50,
  });

  const handleUpdatePhysicalClosingStock = async (itemId: string, val: number) => {
    const monthKey = `${stocksMonth}-${stocksYear}`;
    if (isBillPublishedMap[monthKey]) {
      return alert(
        `Read-only — the bill for ${stocksMonth} ${stocksYear} is published, so stock quantities are frozen. Reopen the month from the Billing tab to make a correction.`
      );
    }

    const qty = Math.max(0, isNaN(val) ? 0 : val);
    const key = `${stocksMonth}-${stocksYear}-${itemId}`;

    // Optimistic local update so typing stays responsive...
    setPhysicalClosingStockMap(prev => ({ ...prev, [key]: qty }));

    // ...but the value is only real once the server has it. This previously
    // lived in component state alone, so the one manually-entered number the
    // whole daily-rate formula depends on was lost on refresh.
    try {
      await adminApi.updatePhysicalStock({
        month: monthNumber(stocksMonth),
        year: parseInt(stocksYear, 10),
        item_id: itemId,
        physical_closing_qty: qty,
      });
    } catch (err: any) {
      alert(err?.message || 'Could not save that stock count. It has not been recorded.');
      await refreshBillStatus(stocksMonth, stocksYear);
    }
  };

  // Student Category Overrides for Monthly Billing Table (Inmate / Lakeside / Outmess)
  const [studentCategoryOverrideMap, setStudentCategoryOverrideMap] = useState<Record<string, 'Inmate' | 'Lakeside' | 'Outmess'>>({
    'MESS-2026-089': 'Inmate',
    'MESS-2026-104': 'Lakeside',
    'MESS-2026-112': 'Inmate',
    'MESS-2026-145': 'Outmess',
    'MESS-2026-178': 'Inmate',
    'MESS-2026-192': 'Lakeside',
    'MESS-2026-210': 'Inmate',
    'MESS-2026-230': 'Inmate',
  });

  const handleUpdateStudentCategoryInBilling = (messId: string, newCategory: 'Inmate' | 'Lakeside' | 'Outmess') => {
    setStudentCategoryOverrideMap(prev => ({
      ...prev,
      [messId]: newCategory,
    }));
  };

  const handleSavePaymentRow = (id: string, newStatus: 'PAID' | 'PENDING', newUtr: string) => {
    setStudentPaymentRecords(prev =>
      prev.map(r => r.id === id ? { ...r, status: newStatus, utrRef: newUtr.trim() } : r)
    );
    alert('Student payment status & UTR reference saved successfully!');
  };

  const checkIsBillLocked = (monthStr: string, yearStr: string, isPublished: boolean): { isLocked: boolean; lockDateFormatted: string } => {
    if (!isPublished) return { isLocked: false, lockDateFormatted: '' };
    return { isLocked: true, lockDateFormatted: 'Permanent Publication' };
  };

  const handleTogglePublishBill = async () => {
    const key = `${billingMonth}-${billingYear}`;
    const m = monthNumber(billingMonth);
    const y = parseInt(billingYear, 10);
    const currentlyPublished = !!isBillPublishedMap[key];

    // Unpublishing is now possible but always audited with a reason. The old
    // build refused every unpublish outright, so a month published by mistake
    // could never be corrected.
    if (currentlyPublished) {
      const reason = window.prompt(
        `Reopen ${billingMonth} ${billingYear} for editing?\n\nThis reverses a published bill, so a reason is recorded in the audit log:`
      );
      if (!reason || reason.trim().length < 3) return;
      try {
        await adminApi.unpublishBill(m, y, reason.trim());
        await refreshBillStatus(billingMonth, billingYear);
        alert(`${billingMonth} ${billingYear} reopened. Stock quantities are editable again.`);
      } catch (err: any) {
        alert(err?.message || 'Could not reopen this bill.');
      }
      return;
    }

    if (!window.confirm(
      `Publish the bill for ${billingMonth} ${billingYear}?\n\n` +
      `Daily rate: ₹${messDailyRate.toFixed(2)}\n` +
      `Grand total: ₹${grandTotalMonthExpense.toLocaleString()}\n\n` +
      `These figures are frozen on publish and stock becomes read-only.`
    )) return;

    try {
      // The server recomputes and stores these; it does not trust the numbers
      // shown here, it records what it was given and derives the rate itself.
      const res = await adminApi.publishBill({
        month: m,
        year: y,
        opening_stock_value: billingOpeningStock,
        purchases_value: totalFoodPurchasesAmount,
        closing_stock_value: billingClosingStock,
        operational_expenses: totalOperationalExpensesAmount,
        administrative_expenses: totalAdminExpenseAmount,
        chargeable_days: billingChargeableDays,
      });
      await refreshBillStatus(billingMonth, billingYear);
      alert(
        `Bill published for ${billingMonth} ${billingYear}.\n\n` +
        `Daily rate: ₹${res.mess_daily_rate}\nGrand total: ₹${res.grand_total_expense}\n\n` +
        `Stock quantities for this month are now frozen.`
      );
    } catch (err: any) {
      alert(err?.message || 'Could not publish this bill.');
    }
  };

  const handleExportBillingExcel = () => {
    const records = studentPaymentRecords.filter(r => r.month === billingMonth && r.year === billingYear);
    
    let csvContent = `CUSAT Mess Monthly Billing Export - ${billingMonth} ${billingYear}\n`;
    csvContent += `Sl No,Mess ID,Student Name,Category,Department,Food Bill (INR),Fine (INR),Total Amount (INR),Payment Status,Ref UTR Number\n`;
    
    records.forEach((r, idx) => {
      csvContent += `${idx + 1},"${r.messId}","${r.name}","${r.category}","${r.department}",${r.foodBill},${r.fineAmount},${r.totalBill},"${r.status}","${r.utrRef || 'N/A'}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `CUSAT_Mess_Billing_${billingMonth}_${billingYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerateStudentBillPdf = (record: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to download student bill PDF.');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Student Mess Invoice - ${record.name} (${record.messId})</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 35px; color: #2D1A0E; line-height: 1.5; font-size: 13px; }
            .header { text-align: center; border-bottom: 2px solid #F47A35; padding-bottom: 15px; margin-bottom: 25px; }
            .header h1 { margin: 0; color: #F47A35; font-size: 24px; }
            .header h2 { margin: 4px 0 0 0; color: #6B4A28; font-size: 15px; font-weight: 600; }
            .invoice-card { background: #FDF7EA; border: 1px solid #E3CB9B; border-radius: 12px; padding: 20px; margin-bottom: 25px; display: flex; justify-content: space-between; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 11px; }
            .badge-paid { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
            .badge-pending { background: #ffedd5; color: #9a3412; border: 1px solid #fdba74; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
            th, td { padding: 10px 14px; border: 1px solid #E3CB9B; text-align: left; }
            th { background-color: #F7EEDA; font-weight: bold; color: #5C3D1E; }
            .total-row { font-weight: 900; background-color: #FFF6EF; font-size: 15px; color: #F47A35; }
            .footer { margin-top: 50px; display: flex; justify-content: space-between; font-size: 12px; color: #9B7B52; border-top: 1px solid #EFDCB4; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Cochin University of Science and Technology</h1>
            <h2>Central Hostel Mess Student Invoice - ${record.month} ${record.year}</h2>
          </div>

          <div class="invoice-card">
            <div>
              <div style="font-size: 18px; font-weight: bold; color: #2D1A0E;">${record.name}</div>
              <div style="color: #F47A35; font-weight: bold; font-family: monospace; font-size: 14px; margin-top: 2px;">Mess ID: ${record.messId}</div>
              <div style="color: #9B7B52; margin-top: 4px;">Department: ${record.department} | Category: ${record.category}</div>
            </div>
            <div style="text-align: right;">
              <div class="badge ${record.status === 'PAID' ? 'badge-paid' : 'badge-pending'}">
                ${record.status === 'PAID' ? 'STATUS: PAID 🟢' : 'STATUS: PAYMENT PENDING 🟠'}
              </div>
              <div style="font-size: 11px; color: #9B7B52; margin-top: 6px;">
                Billing Period: <strong>${record.month} ${record.year}</strong>
              </div>
              ${record.utrRef ? `<div style="font-size: 11px; font-family: monospace; color: #5C3D1E; margin-top: 2px;">UTR Ref: ${record.utrRef}</div>` : ''}
            </div>
          </div>

          <h3>Statement Breakdown</h3>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Details</th>
                <th style="text-align: right;">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Monthly Food Charges</td>
                <td>Opted-in days calculation for ${record.month} ${record.year}</td>
                <td style="text-align: right; font-weight: bold;">₹${record.foodBill.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Fine / Penalties</td>
                <td>Meal skip / Unnotified cuts accrued</td>
                <td style="text-align: right; font-weight: bold; color: ${record.fineAmount > 0 ? '#dc2626' : '#9B7B52'};">₹${record.fineAmount.toLocaleString()}</td>
              </tr>
              <tr class="total-row">
                <td colspan="2">TOTAL AMOUNT PAYABLE</td>
                <td style="text-align: right;">₹${record.totalBill.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <div class="footer">
            <div>Mess Warden Signature</div>
            <div>Student Accountant / Convener</div>
            <div>Student Signature</div>
          </div>

          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Stock Calculations
  const calculatedOpeningStockTotal = openingStockItems.reduce((sum, item) => sum + (item.qty * item.wacPrice), 0);
  const calculatedClosingStockTotal = closingStockItems.reduce((sum, item) => sum + (item.qty * item.wacPrice), 0);

  const billingKey = `${billingMonth}-${billingYear}`;
  const billingOpeningStock = calculatedOpeningStockTotal || openingStockMap[billingKey] || 15000;
  const billingClosingStock = calculatedClosingStockTotal || closingStockMap[billingKey] || 12000;
  const billingChargeableDays = chargeableDaysMap[billingKey] ?? 2850;

  // Food Purchases sum for month
  const monthFoodPurchases = foodPurchases.filter(
    (p) => p.month === billingMonth && p.year === billingYear
  );
  const totalFoodPurchasesAmount = monthFoodPurchases.reduce((sum, p) => sum + p.amount, 0);

  // Operational Expenses for month (all categories)
  const monthOperationalExpenses = opExpenses;
  const totalOperationalExpensesAmount = monthOperationalExpenses.reduce((sum, o) => sum + o.amount, 0);

  // Gas/Fuel operational expenses sum for month
  const monthGasExpenses = monthOperationalExpenses.filter((o) => o.category === 'Gas/Fuel');
  const totalGasExpensesAmount = monthGasExpenses.reduce((sum, o) => sum + o.amount, 0);

  // Administration expense for month
  const monthAdminRecord = adminMonthlyExpenses.find(
    (a) => a.month === billingMonth && a.year === billingYear
  ) || { salary: 85000, allowance: 12000, stationary: 2500, misc: 3800 };

  const totalAdminExpenseAmount =
    monthAdminRecord.salary +
    monthAdminRecord.allowance +
    monthAdminRecord.stationary +
    monthAdminRecord.misc;

  // 4. Actual Food Cost Calculation = 1 + 2 - 3
  const actualFoodCost = totalFoodPurchasesAmount + billingOpeningStock - billingClosingStock;

  // Actual Total Expenditure = (1 + 2 + 3 + 4 - 5)
  const actualCost =
    billingOpeningStock +
    totalFoodPurchasesAmount +
    totalGasExpensesAmount +
    totalAdminExpenseAmount -
    billingClosingStock;

  // GRAND TOTAL EXPENSE OF MONTH = Actual Food Cost + Operational Expenses + Administrational Expenses
  const grandTotalMonthExpense = actualFoodCost + totalOperationalExpensesAmount + totalAdminExpenseAmount;

  // Mess Daily Rate = Actual / Chargeable Days
  const messDailyRate = billingChargeableDays > 0 ? actualCost / billingChargeableDays : 0;

  const handleDownloadBreakdownPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to download the PDF report.');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>CUSAT Mess Expense Breakdown - ${billingMonth} ${billingYear}</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 30px; color: #2D1A0E; line-height: 1.4; font-size: 12px; }
            .header { text-align: center; border-bottom: 2px solid #F47A35; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { margin: 0; color: #F47A35; font-size: 22px; }
            .header h2 { margin: 4px 0 0 0; color: #6B4A28; font-size: 14px; font-weight: 600; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 20px; bg: #FDF7EA; padding: 12px; border-radius: 6px; border: 1px solid #E3CB9B; }
            h3 { font-size: 14px; color: #F47A35; margin: 18px 0 8px 0; border-bottom: 1px solid #EFDCB4; padding-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
            th, td { padding: 8px 12px; border: 1px solid #E3CB9B; text-align: left; font-size: 11px; }
            th { background-color: #F7EEDA; font-weight: bold; color: #5C3D1E; }
            .grand-box { background: linear-gradient(135deg, #1e3a8a, #F47A35); color: white; padding: 20px; border-radius: 12px; text-align: center; margin-top: 25px; box-shadow: 0 4px 12px rgba(37,99,235,0.2); }
            .grand-box h2 { margin: 0 0 6px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #93c5fd; }
            .grand-box .amount { font-size: 32px; font-weight: 900; }
            .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 11px; color: #9B7B52; border-top: 1px solid #EFDCB4; padding-top: 15px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Cochin University of Science and Technology (CUSAT)</h1>
            <h2>Comprehensive Monthly Expense Breakdown - ${billingMonth} ${billingYear}</h2>
          </div>

          <div class="meta">
            <div><strong>Billing Month:</strong> ${billingMonth} ${billingYear}</div>
            <div><strong>Generated Date:</strong> ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            <div><strong>Status:</strong> VERIFIED & AUDITED</div>
          </div>

          <!-- SECTION 1 -->
          <h3>1. Food & Grocery Purchase</h3>
          <table>
            <thead>
              <tr>
                <th>Sl No</th>
                <th>Date</th>
                <th>Item Name</th>
                <th>Quantity</th>
                <th style="text-align: right;">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${monthFoodPurchases.map((fp, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${fp.date}</td>
                  <td>${fp.item}</td>
                  <td>${fp.qty}</td>
                  <td style="text-align: right;">₹${fp.amount.toLocaleString()}</td>
                </tr>
              `).join('')}
              <tr style="font-weight: bold; background: #FDF7EA;">
                <td colspan="4">Total Food & Grocery Purchases</td>
                <td style="text-align: right; color: #F47A35;">₹${totalFoodPurchasesAmount.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <!-- SECTION 2 -->
          <h3>2. Opening Stock</h3>
          <table>
            <thead>
              <tr>
                <th>Sl No</th>
                <th>Item Name</th>
                <th>Qty</th>
                <th style="text-align: right;">WAC Price (₹)</th>
                <th style="text-align: right;">Value (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${openingStockItems.map((op, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${op.itemName}</td>
                  <td>${op.qty}</td>
                  <td style="text-align: right;">₹${op.wacPrice}</td>
                  <td style="text-align: right; font-weight: bold;">₹${(op.qty * op.wacPrice).toLocaleString()}</td>
                </tr>
              `).join('')}
              <tr style="font-weight: bold; background: #FDF7EA;">
                <td colspan="4">Total Opening Stock (Directly Calculated by App)</td>
                <td style="text-align: right; color: #F47A35;">₹${billingOpeningStock.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <!-- SECTION 3 -->
          <h3>3. Closing Stock (Post Physical Count)</h3>
          <table>
            <thead>
              <tr>
                <th>Sl No</th>
                <th>Item Name</th>
                <th>Qty</th>
                <th style="text-align: right;">WAC Price (₹)</th>
                <th style="text-align: right;">Value (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${closingStockItems.map((cl, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${cl.itemName}</td>
                  <td>${cl.qty}</td>
                  <td style="text-align: right;">₹${cl.wacPrice}</td>
                  <td style="text-align: right; font-weight: bold;">₹${(cl.qty * cl.wacPrice).toLocaleString()}</td>
                </tr>
              `).join('')}
              <tr style="font-weight: bold; background: #FDF7EA;">
                <td colspan="4">Total Closing Stock</td>
                <td style="text-align: right; color: #dc2626;">₹${billingClosingStock.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <!-- SECTION 4 -->
          <h3>4. Actual Food Cost Calculation</h3>
          <table>
            <tbody>
              <tr>
                <td>1. Total Food Purchase Amount</td>
                <td style="text-align: right; font-weight: bold;">₹${totalFoodPurchasesAmount.toLocaleString()}</td>
              </tr>
              <tr>
                <td>2. Add Opening Stock Amount</td>
                <td style="text-align: right; font-weight: bold;">+ ₹${billingOpeningStock.toLocaleString()}</td>
              </tr>
              <tr>
                <td>3. Less Closing Stock Amount</td>
                <td style="text-align: right; font-weight: bold; color: #dc2626;">- ₹${billingClosingStock.toLocaleString()}</td>
              </tr>
              <tr style="font-weight: bold; background: #F47A35/10; font-size: 12px;">
                <td>Actual Food Cost of Month (1 + 2 - 3)</td>
                <td style="text-align: right; color: #F47A35; font-size: 14px;">₹${actualFoodCost.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <!-- SECTION 5 -->
          <h3>5. Operational Expenses</h3>
          <table>
            <thead>
              <tr>
                <th>Sl No</th>
                <th>Date</th>
                <th>Category</th>
                <th style="text-align: right;">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${monthOperationalExpenses.map((op, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${op.date}</td>
                  <td>${op.category} (${op.title})</td>
                  <td style="text-align: right; font-weight: bold;">₹${op.amount.toLocaleString()}</td>
                </tr>
              `).join('')}
              <tr style="font-weight: bold; background: #FDF7EA;">
                <td colspan="3">Total Operational Expenses</td>
                <td style="text-align: right; color: #F47A35;">₹${totalOperationalExpensesAmount.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <!-- SECTION 6 -->
          <h3>6. Administrational Expenses</h3>
          <table>
            <thead>
              <tr>
                <th>Sl No</th>
                <th>Description</th>
                <th style="text-align: right;">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>Workers Salary</td><td style="text-align: right;">₹${monthAdminRecord.salary.toLocaleString()}</td></tr>
              <tr><td>2</td><td>Committee Allowance</td><td style="text-align: right;">₹${monthAdminRecord.allowance.toLocaleString()}</td></tr>
              <tr><td>3</td><td>Stationary Charges</td><td style="text-align: right;">₹${monthAdminRecord.stationary.toLocaleString()}</td></tr>
              <tr><td>4</td><td>Miscellaneous Charges</td><td style="text-align: right;">₹${monthAdminRecord.misc.toLocaleString()}</td></tr>
              <tr style="font-weight: bold; background: #FDF7EA;">
                <td colspan="2">Total Administrational Expenses</td>
                <td style="text-align: right; color: #F47A35;">₹${totalAdminExpenseAmount.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <!-- GRAND TOTAL EXPENSE HIGHLIGHTED BOX -->
          <div class="grand-box">
            <h2>GRAND TOTAL EXPENSE OF MONTH ${billingMonth.toUpperCase()} ${billingYear}</h2>
            <div class="amount">₹${grandTotalMonthExpense.toLocaleString()}</div>
            <div style="font-size: 11px; margin-top: 6px; opacity: 0.9;">
              (Actual Food Cost ₹${actualFoodCost.toLocaleString()} + Operational Expenses ₹${totalOperationalExpensesAmount.toLocaleString()} + Administrational Expenses ₹${totalAdminExpenseAmount.toLocaleString()})
            </div>
          </div>

          <div class="footer">
            <div>Mess Warden Signature</div>
            <div>Mess Auditor / Accountant</div>
            <div>Student Mess Convener</div>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleDownloadBillingPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('Please allow popups to download the PDF report.');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>CUSAT Mess Billing Report - ${billingMonth} ${billingYear}</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #2D1A0E; line-height: 1.5; }
            .header { text-align: center; border-bottom: 2px solid #F47A35; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; color: #F47A35; font-size: 24px; }
            .header h2 { margin: 5px 0 0 0; color: #6B4A28; font-size: 15px; font-weight: 500; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 25px; background: #FDF7EA; padding: 15px; border-radius: 8px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { padding: 12px 16px; border: 1px solid #E3CB9B; text-align: left; font-size: 13px; }
            th { background-color: #F7EEDA; font-weight: bold; color: #5C3D1E; }
            .highlight-box { background-color: #F47A35; color: white; padding: 20px; border-radius: 12px; text-align: center; margin-top: 30px; }
            .highlight-box h3 { margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }
            .highlight-box .rate { font-size: 34px; font-weight: 900; }
            .footer { margin-top: 50px; display: flex; justify-content: space-between; font-size: 11px; color: #9B7B52; border-top: 1px solid #EFDCB4; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Cochin University of Science and Technology (CUSAT)</h1>
            <h2>Central Hostel Mess Monthly Billing Statement</h2>
          </div>
          
          <div class="meta">
            <div><strong>Billing Month:</strong> ${billingMonth} ${billingYear}</div>
            <div><strong>Generated Date:</strong> ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            <div><strong>Report Status:</strong> VERIFIED & APPROVED</div>
          </div>

          <h3 style="color: #2D1A0E; margin-bottom: 12px;">Calculation of Daily Mess Rate</h3>
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Expense Head / Particulars</th>
                <th style="text-align: right;">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>Opening Stock</td>
                <td style="text-align: right; font-weight: bold;">₹${billingOpeningStock.toLocaleString()}</td>
              </tr>
              <tr>
                <td>2</td>
                <td>Food Purchases (${monthFoodPurchases.length} logged items)</td>
                <td style="text-align: right; font-weight: bold;">₹${totalFoodPurchasesAmount.toLocaleString()}</td>
              </tr>
              <tr>
                <td>3</td>
                <td>Gas / Fuel Operational Expenses</td>
                <td style="text-align: right; font-weight: bold;">₹${totalGasExpensesAmount.toLocaleString()}</td>
              </tr>
              <tr>
                <td>4</td>
                <td>Administrative Expenses (Salary, Allowance, Stationary, Misc)</td>
                <td style="text-align: right; font-weight: bold;">₹${totalAdminExpenseAmount.toLocaleString()}</td>
              </tr>
              <tr>
                <td>5</td>
                <td>Closing Stock</td>
                <td style="text-align: right; font-weight: bold; color: #dc2626;">- ₹${billingClosingStock.toLocaleString()}</td>
              </tr>
              <tr style="background-color: #FDF7EA; font-weight: bold;">
                <td colspan="2">Actual Expenditure (1 + 2 + 3 + 4 - 5)</td>
                <td style="text-align: right; color: #F47A35; font-size: 15px;">₹${actualCost.toLocaleString()}</td>
              </tr>
              <tr>
                <td colspan="2">Chargeable Student Days (Overall Opted-In Days)</td>
                <td style="text-align: right; font-weight: bold;">${billingChargeableDays.toLocaleString()} Days</td>
              </tr>
            </tbody>
          </table>

          <div class="highlight-box">
            <h3>Calculated Mess Daily Rate</h3>
            <div class="rate">₹${messDailyRate.toFixed(2)} / Day</div>
            <div style="font-size: 12px; opacity: 0.9; margin-top: 5px;">(Formula: Actual Expenditure ₹${actualCost.toLocaleString()} ÷ ${billingChargeableDays} Chargeable Days)</div>
          </div>

          <div class="footer">
            <div>Mess Warden Signature</div>
            <div>Mess Committee Student Rep</div>
            <div>Hostel Administrative Office</div>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Drill-down Modal State
  const [drillDown, setDrillDown] = useState<DrillDownState>({
    isOpen: false,
    mealType: 'BREAKFAST',
    mealTitle: 'Breakfast',
    category: 'SKIPPED',
    categoryLabel: 'Students Skipped',
    colorHex: '#DC2626',
    count: 0,
  });
  const [drillDownStudents, setDrillDownStudents] = useState<any[]>([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [drillDownSearch, setDrillDownSearch] = useState('');

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getDashboard();
      setDashboardData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  // Compute live meal status (Currently Serving / Upcoming / Meal Over) based on current IST time
  const getMealStatusInfo = (mealKey: 'breakfast' | 'lunch' | 'dinner') => {
    const now = new Date();
    const istOffset = 5.5 * 60; // IST is UTC+5:30
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const istMinutes = (utcMinutes + istOffset) % (24 * 60);

    let startMin = 480;  // 8:00 AM
    let endMin = 570;    // 9:30 AM
    let timingText = '8:00 AM – 9:30 AM';

    if (mealKey === 'lunch') {
      startMin = 720;  // 12:00 PM
      endMin = 870;    // 2:30 PM
      timingText = '12:00 PM – 2:30 PM';
    } else if (mealKey === 'dinner') {
      startMin = 1140; // 7:00 PM
      endMin = 1290;   // 9:30 PM
      timingText = '7:00 PM – 9:30 PM';
    }

    if (istMinutes >= startMin && istMinutes <= endMin) {
      return {
        status: 'CURRENTLY_SERVING',
        label: 'Currently Serving',
        colorHex: '#22C55E',
        bgStyle: 'bg-[#22C55E]/10 text-[#16A34A] border-[#22C55E]/30',
        icon: 'play_circle',
        timingText,
      };
    } else if (istMinutes < startMin) {
      return {
        status: 'UPCOMING',
        label: 'Upcoming',
        colorHex: '#3B82F6',
        bgStyle: 'bg-[#3B82F6]/10 text-[#F47A35] border-[#3B82F6]/30',
        icon: 'schedule',
        timingText,
      };
    } else {
      return {
        status: 'MEAL_OVER',
        label: 'Meal Over',
        colorHex: '#6B7280',
        bgStyle: 'bg-[#6B7280]/10 text-[#4B5563] border-[#6B7280]/30',
        icon: 'check_circle',
        timingText,
      };
    }
  };

  const handleOpenDrillDown = async (
    mealType: string,
    mealTitle: string,
    category: 'TOTAL' | 'SERVED' | 'SKIPPED' | 'PENDING' | 'FINED' | 'NOT_ELIGIBLE',
    categoryLabel: string,
    colorHex: string,
    count: number
  ) => {
    setDrillDown({
      isOpen: true,
      mealType,
      mealTitle,
      category,
      categoryLabel,
      colorHex,
      count,
    });
    setDrillDownSearch('');
    setDrillDownLoading(true);
    try {
      const list = await adminApi.getStudentsByStatus(mealType, category);
      setDrillDownStudents(list || []);
    } catch (err) {
      console.error('Failed to fetch student details:', err);
      setDrillDownStudents([]);
    } finally {
      setDrillDownLoading(false);
    }
  };

  const handleSaveHoliday = async () => {
    if (!holidayReason) return alert('Please enter a holiday reason.');
    try {
      await adminApi.declareHoliday(holidayDate, null, holidayReason);
      alert('Holiday declared successfully!');
      setShowHolidayModal(false);
      fetchDashboard();
    } catch (err: any) {
      alert(`Error declaring holiday: ${err.message}`);
    }
  };

  const handleRecordManual = async () => {
    try {
      let studentId = manualStudentId;
      if (!manualStudentId.includes('-')) {
        const students = await adminApi.getStudents(manualStudentId);
        if (students && students.length > 0) {
          studentId = students[0].id;
        } else {
          return alert('Student registration number not found.');
        }
      }

      const today = new Date().toISOString().split('T')[0];
      await adminApi.recordManualAttendance(studentId, today, manualMealType, 'MANUAL', manualReason);
      alert('Manual attendance recorded successfully!');
      setShowManualModal(false);
      fetchDashboard();
    } catch (err: any) {
      alert(`Error recording manual attendance: ${err.message}`);
    }
  };

  const handleSaveEditedMenu = () => {
    if (!editingDayMenu) return;
    const updated = [...weeklyMenu];
    updated[selectedDayIndex] = editingDayMenu;
    setWeeklyMenu(updated);
    setEditingDayMenu(null);
    alert(`Weekly menu for ${editingDayMenu.day} updated successfully!`);
  };

  // -------------------------------------------------------------
  // LEDGER ACTION HANDLERS
  // -------------------------------------------------------------
  const handleAddFoodPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodItem || !foodAmount) return alert('Please enter item name and amount.');
    const d = new Date(foodDate || Date.now());
    const month = d.toLocaleString('en-US', { month: 'long' });
    const year = d.getFullYear().toString();

    const newEntry = {
      id: Date.now().toString(),
      date: foodDate,
      item: foodItem,
      qty: foodQty || '1 unit',
      amount: parseFloat(foodAmount),
      month,
      year,
    };
    setFoodPurchases([newEntry, ...foodPurchases]);
    setFoodItem('');
    setFoodQty('');
    setFoodAmount('');
    alert('Food purchase logged successfully!');
  };

  const handleDeleteFoodPurchase = (id: string) => {
    if (window.confirm('Are you sure you want to delete this food purchase record?')) {
      setFoodPurchases(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleAddOpExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opTitle || !opAmount) return alert('Please enter expense title and amount.');

    const newEntry = {
      id: `op-${Date.now()}`,
      date: opDate,
      title: opTitle,
      category: opCategory,
      amount: parseFloat(opAmount),
    };
    setOpExpenses([newEntry, ...opExpenses]);
    setOpTitle('');
    setOpAmount('');
    alert('Operational expense logged successfully!');
  };

  const handleDeleteOpExpense = (id: string) => {
    if (window.confirm('Are you sure you want to delete this operational expense record?')) {
      setOpExpenses(prev => prev.filter(o => o.id !== id));
    }
  };

  const handleAddAdminExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const sal = parseFloat(adminSalary || '0');
    const all = parseFloat(adminAllowance || '0');
    const stat = parseFloat(adminStationary || '0');
    const misc = parseFloat(adminMisc || '0');

    if (sal === 0 && all === 0 && stat === 0 && misc === 0) {
      return alert('Please enter at least one expense amount.');
    }

    const newEntry: AdminExpenseMonthRecord = {
      id: `ad-${adminBillMonth.toLowerCase()}-${adminBillYear}-${Date.now()}`,
      month: adminBillMonth,
      year: adminBillYear,
      salary: sal,
      allowance: all,
      stationary: stat,
      misc,
    };

    const filtered = adminMonthlyExpenses.filter(
      (a) => !(a.month === adminBillMonth && a.year === adminBillYear)
    );
    setAdminMonthlyExpenses([newEntry, ...filtered]);
    setAdminSalary('');
    setAdminAllowance('');
    setAdminStationary('');
    setAdminMisc('');
    alert(`Administrative expense for ${adminBillMonth} ${adminBillYear} logged successfully!`);
  };

  const handleDeleteAdminExpense = (id: string) => {
    if (window.confirm('Are you sure you want to delete this administrative expense record?')) {
      setAdminMonthlyExpenses(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleAddInventoryCatalogItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvName.trim()) return alert('Please enter item name.');

    if (inventoryCatalog.some(i => i.name.toLowerCase() === newInvName.trim().toLowerCase())) {
      return alert('An item with this name already exists in the inventory catalogue.');
    }

    const newItem: InventoryCatalogItem = {
      id: `inv-cat-${Date.now()}`,
      name: newInvName.trim(),
      unit: newInvUnit.trim() || 'unit',
    };

    setInventoryCatalog([...inventoryCatalog, newItem]);
    setNewInvName('');
    setNewInvUnit('kg');
    alert(`"${newItem.name}" added to Inventory Catalogue! It can now be selected in Food Purchases.`);
  };

  const handleDeleteInventoryCatalogItem = (id: string) => {
    if (window.confirm('Are you sure you want to delete this item from the inventory catalogue?')) {
      setInventoryCatalog(prev => prev.filter(i => i.id !== id));
    }
  };

  // Filtered Food Purchases
  const filteredFoodPurchases = foodPurchases.filter(p => {
    if (foodSearch && !p.item.toLowerCase().includes(foodSearch.toLowerCase())) return false;
    if (foodMonthFilter !== 'ALL' && p.month !== foodMonthFilter) return false;
    if (foodYearFilter !== 'ALL' && p.year !== foodYearFilter) return false;
    return true;
  });

  const totalFoodCost = filteredFoodPurchases.reduce((sum, p) => sum + p.amount, 0);



  const filteredDrillDownStudents = drillDownStudents.filter((s) => {
    if (!drillDownSearch) return true;
    const q = drillDownSearch.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.registration_number?.toLowerCase().includes(q) ||
      s.department?.toLowerCase().includes(q) ||
      s.mess_id?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 p-4 pb-28 lg:px-10 lg:pt-8 lg:pb-14 animate-fade-in" style={{ background: 'var(--bg)' }}>
      <div className="max-w-[1280px] mx-auto space-y-6">
        
        {/* Page header — the top bar already names the section, so this is just
            the date and the two page actions, on one row at every size */}
        <div
          className="flex items-center justify-between gap-3 pb-3"
          style={{ borderBottom: '1px solid var(--card-border)' }}
        >
          <p
            className="text-[12px] sm:text-sm font-semibold flex items-center gap-1.5 min-w-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16 }}>calendar_today</span>
            <span className="truncate">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </p>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchDashboard}
              className="flex items-center gap-1.5 px-3 py-2 font-bold text-xs rounded-xl cursor-pointer"
              style={{ background: 'var(--card)', color: 'var(--text-body)', border: '1px solid var(--card-border)' }}
              title="Refresh"
            >
              <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`} style={{ fontSize: 17 }}>refresh</span>
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 font-bold text-xs rounded-xl cursor-pointer"
              style={{ background: 'var(--orange)', color: '#fff', border: 'none' }}
              title="Export"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>download</span>
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* MODULE 1: DAILY SUMMARY                                       */}
        {/* ------------------------------------------------------------- */}
        {activeModuleTab === 'daily-summary' && (
          <section className="space-y-6 animate-fade-in">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-display text-[20px] font-bold flex items-center gap-2" style={{ color: 'var(--text-dark)' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--orange)' }}>today</span>
                Live Meal Overview
              </h2>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Click any metric card to inspect individual student records
              </p>
            </div>

            {(['breakfast', 'lunch', 'dinner'] as const).map((mealKey) => {
              const mealTitle = mealKey.charAt(0).toUpperCase() + mealKey.slice(1);
              const statusInfo = getMealStatusInfo(mealKey);
              const stats = dashboardData?.today_stats?.[mealKey] || {};

              const totalCount = stats.total || dashboardData?.total_students || 1240;
              const servedCount = stats.served ?? stats.attendance ?? (mealKey === 'breakfast' ? 1080 : mealKey === 'lunch' ? 950 : 880);
              const skippedCount = stats.skipped ?? (mealKey === 'breakfast' ? 120 : mealKey === 'lunch' ? 150 : 200);
              const pendingCount = stats.pending ?? Math.max(0, totalCount - servedCount - skippedCount);
              const finedCount = stats.fined ?? (mealKey === 'breakfast' ? 40 : mealKey === 'lunch' ? 25 : 30);
              const notEligibleCount = stats.not_eligible ?? 0;
              const menuText = stats.menu || (mealKey === 'breakfast' ? 'Appam & Egg Curry / Veg Stew + Tea' : mealKey === 'lunch' ? 'Kerala Meals & Fish Curry' : 'Chapati & Chicken Curry + Milk');

              const mealIconColor = mealKey === 'breakfast' ? 'var(--meal-breakfast, #FFE4BC)' : mealKey === 'lunch' ? 'var(--meal-lunch, #FFD6D6)' : 'var(--meal-dinner, #E0D6F5)';
              const mealTextColor = mealKey === 'breakfast' ? '#8B5E0A' : mealKey === 'lunch' ? '#8B1A1A' : '#3D1A8B';

              return (
                <div
                  key={mealKey}
                  className="rounded-2xl border overflow-hidden transition-all hover:shadow-md"
                  style={{ background: 'var(--card, #fff)', borderColor: 'var(--card-border, #EDD5A0)', boxShadow: 'var(--card-shadow, 0 2px 16px rgba(100,60,10,0.10))' }}
                >
                  {/* Header band — stacks on phones so the time range and the
                      status pill never get squeezed onto one line */}
                  <div
                    className="p-4 border-b"
                    style={{ background: mealIconColor, borderColor: 'var(--card-border)' }}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(255,255,255,0.65)', color: mealTextColor }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                          {mealKey === 'breakfast' ? 'bakery_dining' : mealKey === 'lunch' ? 'lunch_dining' : 'dinner_dining'}
                        </span>
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                          <h3
                            className="font-display text-[19px] font-bold leading-none"
                            style={{ color: 'var(--text-dark)' }}
                          >
                            {mealTitle}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${statusInfo.bgStyle}`}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                              {statusInfo.icon}
                            </span>
                            {statusInfo.label}
                          </span>
                        </div>

                        <p
                          className="text-[12px] font-bold mt-1 whitespace-nowrap"
                          style={{ color: 'var(--text-body)', fontVariantNumeric: 'tabular-nums' }}
                        >
                          {statusInfo.timingText}
                        </p>
                      </div>
                    </div>

                    <p
                      className="text-[12px] font-semibold mt-2.5 leading-snug"
                      style={{ color: 'var(--text-body)' }}
                    >
                      <span style={{ color: 'var(--text-dark)', fontWeight: 800 }}>Today&rsquo;s menu: </span>
                      {menuText}
                    </p>
                  </div>

                  {/* Metric tiles */}
                  <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
                    {([
                      { key: 'TOTAL',        title: 'Total Students',   label: 'Total students', sub: 'Click for list',  icon: 'groups',       color: '#F47A35', value: totalCount },
                      { key: 'SERVED',       title: 'Students Served',  label: 'Served',         sub: 'Scanned & eaten', icon: 'check_circle', color: '#16A34A', value: servedCount },
                      { key: 'SKIPPED',      title: 'Students Skipped', label: 'Skipped',        sub: 'Opted out',       icon: 'cancel',       color: '#DC2626', value: skippedCount },
                      { key: 'PENDING',      title: 'Students Pending', label: 'Pending',        sub: 'Awaiting scan',   icon: 'pending',      color: '#EA580C', value: pendingCount },
                      { key: 'FINED',        title: 'Fined Students',   label: 'Fined',          sub: 'Missed & fined',  icon: 'warning',      color: '#DC2626', value: finedCount },
                      { key: 'NOT_ELIGIBLE', title: 'Not Eligible',     label: 'Not eligible',   sub: 'Excluded',        icon: 'block',        color: '#6B7280', value: notEligibleCount },
                    ] as const).map(m => (
                      <button
                        key={m.key}
                        onClick={() => handleOpenDrillDown(mealKey.toUpperCase(), mealTitle, m.key, m.title, m.color, m.value)}
                        className="p-3 rounded-xl text-left cursor-pointer transition-colors flex flex-col gap-1"
                        style={{
                          border: `1px solid ${m.color}38`,
                          background: `${m.color}0D`,
                        }}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 15, color: m.color }}>
                            {m.icon}
                          </span>
                          <span
                            className="text-[11px] font-bold truncate"
                            style={{ color: m.color, fontFamily: 'Nunito, sans-serif' }}
                          >
                            {m.label}
                          </span>
                        </span>

                        <span
                          className="font-display text-[22px] font-bold leading-none"
                          style={{ color: m.color, fontVariantNumeric: 'tabular-nums' }}
                        >
                          {m.value.toLocaleString()}
                        </span>

                        <span className="flex items-center gap-0.5 text-[10.5px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                          <span className="truncate">{m.sub}</span>
                          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 12 }}>chevron_right</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODULE 2: MENU FOR THE WEEK                                   */}
        {/* ------------------------------------------------------------- */}
        {activeModuleTab === 'weekly-menu' && (
          <section className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-bold text-[#2D1A0E] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#F47A35]">restaurant_menu</span>
                  Weekly Mess Menu Management
                </h2>
                <p className="text-xs font-medium text-[#9B7B52]">
                  Inspect and edit official food items for Monday through Sunday
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/30 text-xs font-bold rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse"></span> Active Menu Schedule
                </span>
              </div>
            </div>

            {/* Day Selector Tabs */}
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 border-b border-[#EFDCB4]">
              {weeklyMenu.map((item, idx) => (
                <button
                  key={item.day}
                  onClick={() => setSelectedDayIndex(idx)}
                  className={`px-3.5 sm:px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition-colors whitespace-nowrap cursor-pointer shrink-0 ${
                    selectedDayIndex === idx
                      ? 'bg-[#F47A35] text-white'
                      : 'bg-white text-[#6B4A28] hover:bg-[#F7EEDA] border border-[#EFDCB4]'
                  }`}
                >
                  {/* Phones only have room for the short form */}
                  <span className="sm:hidden">{item.day.slice(0, 3)}</span>
                  <span className="hidden sm:inline">{item.day}</span>
                </button>
              ))}
            </div>

            {/* Selected Day Menu Detail Card */}
            {(() => {
              const currentDay = weeklyMenu[selectedDayIndex];
              return (
                <div className="bg-white rounded-2xl border border-[#EFDCB4] p-4 sm:p-6 space-y-5 sm:space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#EFDCB4] pb-4 gap-3">
                    <div>
                      <h3 className="text-2xl font-extrabold text-[#2D1A0E]">{currentDay.day} Menu Schedule</h3>
                      <p className="text-xs font-medium text-[#9B7B52] mt-0.5">
                        Official CUSAT Mess Food Items
                      </p>
                    </div>

                    <button
                      onClick={() => setEditingDayMenu({ ...currentDay })}
                      className="px-4 py-2 bg-[#F47A35] hover:bg-[#D45E1A] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                      Edit {currentDay.day} Menu
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Breakfast */}
                    <div className="p-5 rounded-2xl border border-[#F47A35]/20 bg-[#F47A35]/5 space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="p-2 bg-[#F47A35] text-white rounded-xl">
                            <span className="material-symbols-outlined text-[20px]">bakery_dining</span>
                          </span>
                          <div>
                            <h4 className="font-extrabold text-base text-[#2D1A0E]">Breakfast</h4>
                            <p className="text-[11px] font-semibold text-[#F47A35]">8:00 AM – 9:30 AM</p>
                          </div>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-[#F47A35]/10">
                        <p className="text-sm font-semibold text-[#5C3D1E] leading-relaxed">
                          {currentDay.breakfast}
                        </p>
                      </div>
                    </div>

                    {/* Lunch */}
                    <div className="p-5 rounded-2xl border border-[#16a34a]/20 bg-[#16a34a]/5 space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="p-2 bg-[#16a34a] text-white rounded-xl">
                            <span className="material-symbols-outlined text-[20px]">lunch_dining</span>
                          </span>
                          <div>
                            <h4 className="font-extrabold text-base text-[#2D1A0E]">Lunch</h4>
                            <p className="text-[11px] font-semibold text-[#16a34a]">12:00 PM – 2:30 PM</p>
                          </div>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-[#16a34a]/10">
                        <p className="text-sm font-semibold text-[#5C3D1E] leading-relaxed">
                          {currentDay.lunch}
                        </p>
                      </div>
                    </div>

                    {/* Dinner */}
                    <div className="p-5 rounded-2xl border border-[#7c3aed]/20 bg-[#7c3aed]/5 space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="p-2 bg-[#7c3aed] text-white rounded-xl">
                            <span className="material-symbols-outlined text-[20px]">dinner_dining</span>
                          </span>
                          <div>
                            <h4 className="font-extrabold text-base text-[#2D1A0E]">Dinner</h4>
                            <p className="text-[11px] font-semibold text-[#7c3aed]">7:00 PM – 9:30 PM</p>
                          </div>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-[#7c3aed]/10">
                        <p className="text-sm font-semibold text-[#5C3D1E] leading-relaxed">
                          {currentDay.dinner}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODULE 3: LEDGER / ACCOUNTS (4 SUB NAVIGATION TABS)            */}
        {/* ------------------------------------------------------------- */}
        {activeModuleTab === 'ledger' && (
          <section className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-bold text-[#2D1A0E] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#F47A35]">account_balance_wallet</span>
                  Ledger & Operational Accounts
                </h2>
                <p className="text-xs font-medium text-[#9B7B52]">
                  Complete purchase history, operational costs, administrative expenses, and inventory management
                </p>
              </div>

              <button
                onClick={() => setShowExportModal(true)}
                className="px-4 py-2 bg-[#F47A35] hover:bg-[#D45E1A] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">file_download</span>
                Download Ledger Summary
              </button>
            </div>

            {/* Ledger sub-navigation — a single scrolling row on phones so the
                labels never wrap into ragged two-line blocks */}
            <div className="bg-white rounded-2xl border border-[#EFDCB4] p-1.5 flex gap-1 overflow-x-auto hide-scrollbar">
              {([
                { id: 'food-purchases',        label: 'Food purchases',  icon: 'shopping_cart' },
                { id: 'operational-expenses',  label: 'Operational',     icon: 'settings' },
                { id: 'admin-expenses',        label: 'Administrative',  icon: 'work' },
                { id: 'inventory',             label: 'Inventory',       icon: 'inventory_2' },
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => setLedgerSubTab(t.id)}
                  className={`shrink-0 lg:flex-1 py-2.5 px-3.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
                    ledgerSubTab === t.id
                      ? 'bg-[#F47A35] text-white'
                      : 'text-[#9B7B52] hover:bg-[#F7EEDA] hover:text-[#2D1A0E]'
                  }`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>

            {/* --------------------------------------------------------- */}
            {/* SUB TAB 1: FOOD PURCHASES                                 */}
            {/* --------------------------------------------------------- */}
            {ledgerSubTab === 'food-purchases' && (
              <div className="space-y-6 animate-fade-in">
                
                {/* Food Purchase Logging Form Card */}
                <div className="bg-white p-5 rounded-2xl border border-[#EFDCB4] shadow-xs space-y-4">
                  <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#F47A35]">add_shopping_cart</span>
                    Log New Food Purchase Entry
                  </h3>

                  <form onSubmit={handleAddFoodPurchase} className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#6B4A28] mb-1">Item Name (from Inventory)</label>
                      <select
                        value={foodItem}
                        onChange={(e) => setFoodItem(e.target.value)}
                        required
                        className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                      >
                        <option value="">Select item from inventory...</option>
                        {inventoryCatalog.map((inv) => (
                          <option key={inv.id} value={inv.name}>
                            {inv.name} ({inv.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#6B4A28] mb-1">Purchase Date</label>
                      <input
                        type="date"
                        value={foodDate}
                        onChange={(e) => setFoodDate(e.target.value)}
                        required
                        className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#6B4A28] mb-1">Quantity / Weight</label>
                      <input
                        type="text"
                        value={foodQty}
                        onChange={(e) => setFoodQty(e.target.value)}
                        placeholder="e.g. 50 kg / 80 L"
                        className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#6B4A28] mb-1">Total Amount (₹)</label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="number"
                          value={foodAmount}
                          onChange={(e) => setFoodAmount(e.target.value)}
                          placeholder="e.g. 2750"
                          required
                          min="0"
                          step="any"
                          className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                        />
                        <button
                          type="submit"
                          className="w-full sm:w-auto px-4 py-2.5 bg-[#F47A35] hover:bg-[#D45E1A] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Log Purchase
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

                {/* Summary Stat Bar */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs">
                    <p className="text-xs font-bold text-[#9B7B52]">Total Food Purchase Cost</p>
                    <p className="text-2xl font-extrabold text-[#F47A35] mt-1">₹{totalFoodCost.toLocaleString()}</p>
                    <p className="text-[11px] text-[#9B7B52] mt-1">Filtered result total</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs">
                    <p className="text-xs font-bold text-[#9B7B52]">Total Purchase Logs</p>
                    <p className="text-2xl font-extrabold text-[#2D1A0E] mt-1">{filteredFoodPurchases.length} Entries</p>
                    <p className="text-[11px] text-[#9B7B52] mt-1">Logged food entries</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs">
                    <p className="text-xs font-bold text-[#9B7B52]">Average Purchase Price</p>
                    <p className="text-2xl font-extrabold text-[#16a34a] mt-1">
                      ₹{filteredFoodPurchases.length ? Math.round(totalFoodCost / filteredFoodPurchases.length).toLocaleString() : 0}
                    </p>
                    <p className="text-[11px] text-[#9B7B52] mt-1">Avg cost per order</p>
                  </div>
                </div>

                {/* Search & Filter Toolbar */}
                <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
                  <div className="relative w-full md:w-96">
                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#BFA37A] text-[20px]">
                      search
                    </span>
                    <input
                      type="text"
                      value={foodSearch}
                      onChange={(e) => setFoodSearch(e.target.value)}
                      placeholder="Search items by name (e.g. Rice, Milk, Eggs)..."
                      className="w-full pl-10 pr-4 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                    />
                  </div>

                  <div className="flex gap-2 w-full md:w-auto">
                    <select
                      value={foodMonthFilter}
                      onChange={(e) => setFoodMonthFilter(e.target.value)}
                      className="px-3 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#5C3D1E]"
                    >
                      <option value="ALL">All Months</option>
                      <option value="August">August</option>
                      <option value="July">July</option>
                      <option value="June">June</option>
                      <option value="May">May</option>
                      <option value="December">December</option>
                    </select>

                    <select
                      value={foodYearFilter}
                      onChange={(e) => setFoodYearFilter(e.target.value)}
                      className="px-3 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#5C3D1E]"
                    >
                      <option value="ALL">All Years</option>
                      <option value="2026">2026</option>
                      <option value="2025">2025</option>
                      <option value="2024">2024</option>
                    </select>
                  </div>
                </div>

                {/* Food Purchase History Table */}
                <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-[#EFDCB4] flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5">
                    <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#F47A35]">history</span>
                      Food Purchase History Log
                    </h3>
                    <span className="text-xs font-semibold text-[#9B7B52]">
                      Showing {filteredFoodPurchases.length} records
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="data-table text-left text-sm">
                      <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold text-xs uppercase border-b border-[#EFDCB4]">
                        <tr>
                          <th className="py-3.5 px-4">Date</th>
                          <th className="py-3.5 px-4">Item Name</th>
                          <th className="py-3.5 px-4">Quantity</th>
                          <th className="py-3.5 px-4">Amount (₹)</th>
                          <th className="py-3.5 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFDCB4]">
                        {filteredFoodPurchases.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-[#9B7B52] text-sm">
                              No food purchase entries matching search filter.
                            </td>
                          </tr>
                        ) : (
                          filteredFoodPurchases.map((row) => (
                            <tr key={row.id} className="hover:bg-[#FDF7EA] transition-colors">
                              <td className="py-3 px-4 font-mono text-xs text-[#5C3D1E]">{row.date}</td>
                              <td className="py-3 px-4 font-semibold text-[#2D1A0E]">{row.item}</td>
                              <td className="py-3 px-4 text-xs font-medium text-[#6B4A28]">{row.qty}</td>
                              <td className="py-3 px-4 font-extrabold text-[#16a34a]">₹{row.amount.toLocaleString()}</td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => handleDeleteFoodPurchase(row.id)}
                                  className="p-1.5 text-[#dc2626] hover:bg-[#dc2626]/10 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Item Entry"
                                >
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* --------------------------------------------------------- */}
            {/* SUB TAB 2: OPERATIONAL EXPENSES                           */}
            {/* --------------------------------------------------------- */}
            {ledgerSubTab === 'operational-expenses' && (
              <div className="space-y-6 animate-fade-in">
                
                {/* Form Card */}
                <div className="bg-white p-5 rounded-2xl border border-[#EFDCB4] shadow-xs space-y-4">
                  <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#F47A35]">build</span>
                    Log Operational Expense Entry
                  </h3>

                  <form onSubmit={handleAddOpExpense} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#6B4A28] mb-1">Date</label>
                      <input
                        type="date"
                        value={opDate}
                        onChange={(e) => setOpDate(e.target.value)}
                        required
                        className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#6B4A28] mb-1">Title</label>
                      <input
                        type="text"
                        value={opTitle}
                        onChange={(e) => setOpTitle(e.target.value)}
                        placeholder="e.g. Indane LPG Commercial Cylinder Refill"
                        required
                        className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#6B4A28] mb-1">Category</label>
                      <select
                        value={opCategory}
                        onChange={(e) => setOpCategory(e.target.value as 'Gas/Fuel' | 'Miscellaneous')}
                        className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-bold text-[#5C3D1E] focus:outline-none focus:border-[#F47A35]"
                      >
                        <option value="Gas/Fuel">Gas/Fuel</option>
                        <option value="Miscellaneous">Miscellaneous</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#6B4A28] mb-1">Amount (₹)</label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="number"
                          value={opAmount}
                          onChange={(e) => setOpAmount(e.target.value)}
                          placeholder="e.g. 7400"
                          required
                          min="0"
                          step="any"
                          className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                        />
                        <button
                          type="submit"
                          className="w-full sm:w-auto px-4 py-2.5 bg-[#F47A35] hover:bg-[#D45E1A] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Log Expense
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

                {/* History Table */}
                <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-[#EFDCB4] flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5">
                    <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#F47A35]">receipt_long</span>
                      Operational Expenses Log
                    </h3>
                    <span className="text-xs font-semibold text-[#9B7B52]">{opExpenses.length} entries</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="data-table text-left text-sm">
                      <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold text-xs uppercase border-b border-[#EFDCB4]">
                        <tr>
                          <th className="py-3.5 px-4">Date</th>
                          <th className="py-3.5 px-4">Title</th>
                          <th className="py-3.5 px-4">Category</th>
                          <th className="py-3.5 px-4">Amount (₹)</th>
                          <th className="py-3.5 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFDCB4]">
                        {opExpenses.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-[#9B7B52] text-sm">
                              No operational expenses logged yet.
                            </td>
                          </tr>
                        ) : (
                          opExpenses.map((row) => (
                            <tr key={row.id} className="hover:bg-[#FDF7EA] transition-colors">
                              <td className="py-3 px-4 font-mono text-xs text-[#5C3D1E]">{row.date}</td>
                              <td className="py-3 px-4 font-semibold text-[#2D1A0E]">{row.title}</td>
                              <td className="py-3 px-4">
                                <span className={`px-2.5 py-0.5 text-xs font-extrabold rounded-full border ${
                                  row.category === 'Gas/Fuel'
                                    ? 'bg-[#ea580c]/10 text-[#ea580c] border-[#ea580c]/30'
                                    : 'bg-[#7c3aed]/10 text-[#7c3aed] border-[#7c3aed]/30'
                                }`}>
                                  {row.category}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-extrabold text-[#dc2626]">₹{row.amount.toLocaleString()}</td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => handleDeleteOpExpense(row.id)}
                                  className="p-1.5 text-[#dc2626] hover:bg-[#dc2626]/10 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Item Entry"
                                >
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* --------------------------------------------------------- */}
            {/* SUB TAB 3: ADMINISTRATIVE EXPENSES                        */}
            {/* --------------------------------------------------------- */}
            {ledgerSubTab === 'admin-expenses' && (
              <div className="space-y-6 animate-fade-in">
                
                {/* Form Card */}
                <div className="bg-white p-5 rounded-2xl border border-[#EFDCB4] shadow-xs space-y-4">
                  <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#F47A35]">badge</span>
                    Log Administrative Expense Entry
                  </h3>

                  <form onSubmit={handleAddAdminExpense} className="space-y-4">
                    {/* Top Row: Bill Month & Bill Year */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-3 border-b border-[#EFDCB4]">
                      <div>
                        <label className="block text-xs font-bold text-[#6B4A28] mb-1">Bill Month</label>
                        <select
                          value={adminBillMonth}
                          onChange={(e) => setAdminBillMonth(e.target.value)}
                          className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                        >
                          <option value="January">January</option>
                          <option value="February">February</option>
                          <option value="March">March</option>
                          <option value="April">April</option>
                          <option value="May">May</option>
                          <option value="June">June</option>
                          <option value="July">July</option>
                          <option value="August">August</option>
                          <option value="September">September</option>
                          <option value="October">October</option>
                          <option value="November">November</option>
                          <option value="December">December</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#6B4A28] mb-1">Bill Year</label>
                        <select
                          value={adminBillYear}
                          onChange={(e) => setAdminBillYear(e.target.value)}
                          className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                        >
                          <option value="2026">2026</option>
                          <option value="2025">2025</option>
                          <option value="2024">2024</option>
                          <option value="2023">2023</option>
                        </select>
                      </div>
                    </div>

                    {/* Stacked Rows for Amounts */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-[#6B4A28] mb-1">Workers Salary (₹)</label>
                        <input
                          type="number"
                          value={adminSalary}
                          onChange={(e) => setAdminSalary(e.target.value)}
                          placeholder="e.g. 85000"
                          min="0"
                          step="any"
                          className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#6B4A28] mb-1">Committee Allowance (₹)</label>
                        <input
                          type="number"
                          value={adminAllowance}
                          onChange={(e) => setAdminAllowance(e.target.value)}
                          placeholder="e.g. 12000"
                          min="0"
                          step="any"
                          className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#6B4A28] mb-1">Stationary Charges (₹)</label>
                        <input
                          type="number"
                          value={adminStationary}
                          onChange={(e) => setAdminStationary(e.target.value)}
                          placeholder="e.g. 2500"
                          min="0"
                          step="any"
                          className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#6B4A28] mb-1">Misc Charges (₹)</label>
                        <input
                          type="number"
                          value={adminMisc}
                          onChange={(e) => setAdminMisc(e.target.value)}
                          placeholder="e.g. 3800"
                          min="0"
                          step="any"
                          className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-[#F47A35] hover:bg-[#D45E1A] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[18px]">add_circle</span>
                      Log Administrative Expense for {adminBillMonth} {adminBillYear}
                    </button>
                  </form>
                </div>

                {/* History Table */}
                <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-[#EFDCB4] flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5">
                    <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#F47A35]">history</span>
                      Administrative Expenses History Log (Month-Wise)
                    </h3>
                    <span className="text-xs font-semibold text-[#9B7B52]">{adminMonthlyExpenses.length} records</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="data-table text-left text-sm">
                      <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold text-xs uppercase border-b border-[#EFDCB4]">
                        <tr>
                          <th className="py-3.5 px-4">Month</th>
                          <th className="py-3.5 px-4">Salary (₹)</th>
                          <th className="py-3.5 px-4">Allowance (₹)</th>
                          <th className="py-3.5 px-4">Stationary (₹)</th>
                          <th className="py-3.5 px-4">Misc (₹)</th>
                          <th className="py-3.5 px-4">Total (₹)</th>
                          <th className="py-3.5 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFDCB4]">
                        {adminMonthlyExpenses.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-[#9B7B52] text-sm">
                              No administrative expenses logged yet.
                            </td>
                          </tr>
                        ) : (
                          adminMonthlyExpenses.map((row) => {
                            const totalMonth = row.salary + row.allowance + row.stationary + row.misc;
                            return (
                              <tr key={row.id} className="hover:bg-[#FDF7EA] transition-colors">
                                <td className="py-3 px-4 font-bold text-[#2D1A0E]">{row.month} {row.year}</td>
                                <td className="py-3 px-4 font-semibold text-[#5C3D1E]">₹{row.salary.toLocaleString()}</td>
                                <td className="py-3 px-4 font-semibold text-[#5C3D1E]">₹{row.allowance.toLocaleString()}</td>
                                <td className="py-3 px-4 text-xs text-[#6B4A28]">₹{row.stationary.toLocaleString()}</td>
                                <td className="py-3 px-4 text-xs text-[#6B4A28]">₹{row.misc.toLocaleString()}</td>
                                <td className="py-3 px-4 font-extrabold text-[#F47A35]">₹{totalMonth.toLocaleString()}</td>
                                <td className="py-3 px-4 text-center">
                                  <button
                                    onClick={() => handleDeleteAdminExpense(row.id)}
                                    className="p-1.5 text-[#dc2626] hover:bg-[#dc2626]/10 rounded-lg transition-colors cursor-pointer"
                                    title="Delete Entry"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* --------------------------------------------------------- */}
            {/* SUB TAB 4: INVENTORY                                      */}
            {/* --------------------------------------------------------- */}
            {ledgerSubTab === 'inventory' && (
              <div className="space-y-6 animate-fade-in">
                
                {/* Form Card: Add Item to Catalogue */}
                <div className="bg-white p-5 rounded-2xl border border-[#EFDCB4] shadow-xs space-y-4">
                  <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#F47A35]">add_box</span>
                    Add New Inventory Item
                  </h3>
                  <p className="text-xs text-[#9B7B52]">
                    Items added here will be available in the dropdown menu when logging Food Purchases.
                  </p>

                  <form onSubmit={handleAddInventoryCatalogItem} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#6B4A28] mb-1">Item Name</label>
                      <input
                        type="text"
                        value={newInvName}
                        onChange={(e) => setNewInvName(e.target.value)}
                        placeholder="e.g. Coconut Oil / Green Gram"
                        required
                        className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#6B4A28] mb-1">Unit</label>
                      <input
                        type="text"
                        value={newInvUnit}
                        onChange={(e) => setNewInvUnit(e.target.value)}
                        placeholder="e.g. kg, L, pcs, bags, tins"
                        required
                        className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="w-full py-2.5 bg-[#F47A35] hover:bg-[#D45E1A] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[18px]">add_circle</span>
                        Add Item to Catalogue
                      </button>
                    </div>
                  </form>
                </div>

                {/* Inventory Items Catalogue Table Card */}
                <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-[#EFDCB4] flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                      <h3 className="font-extrabold text-base text-[#2D1A0E] flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#F47A35]">inventory_2</span>
                        Inventory Items Catalogue
                      </h3>
                      <p className="text-xs text-[#9B7B52]">
                        Registered mess items ({inventoryCatalog.length} total)
                      </p>
                    </div>

                    <div className="relative w-full md:w-72">
                      <span className="material-symbols-outlined absolute left-3 top-2 text-[#BFA37A] text-[18px]">
                        search
                      </span>
                      <input
                        type="text"
                        value={invSearch}
                        onChange={(e) => setInvSearch(e.target.value)}
                        placeholder="Search items by name..."
                        className="w-full pl-9 pr-3 py-1.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-medium focus:outline-none focus:border-[#F47A35]"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="data-table text-left text-sm">
                      <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold text-xs uppercase border-b border-[#EFDCB4]">
                        <tr>
                          <th className="py-3.5 px-4">Item Name</th>
                          <th className="py-3.5 px-4">Unit</th>
                          <th className="py-3.5 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFDCB4]">
                        {inventoryCatalog.filter(i => !invSearch || i.name.toLowerCase().includes(invSearch.toLowerCase())).length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-8 text-center text-[#9B7B52] text-sm">
                              No inventory items found. Add items above.
                            </td>
                          </tr>
                        ) : (
                          inventoryCatalog
                            .filter(i => !invSearch || i.name.toLowerCase().includes(invSearch.toLowerCase()))
                            .map((row) => (
                              <tr key={row.id} className="hover:bg-[#FDF7EA] transition-colors">
                                <td className="py-3.5 px-4 font-semibold text-[#2D1A0E]">{row.name}</td>
                                <td className="py-3.5 px-4 font-mono text-xs font-bold text-[#F47A35]">{row.unit}</td>
                                <td className="py-3.5 px-4 text-center">
                                  <button
                                    onClick={() => handleDeleteInventoryCatalogItem(row.id)}
                                    className="p-1.5 text-[#dc2626] hover:bg-[#dc2626]/10 rounded-lg transition-colors cursor-pointer"
                                    title="Delete Inventory Item"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                  </button>
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

          </section>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODULE 4: STUDENT DATA                                         */}
        {/* ------------------------------------------------------------- */}
        {activeModuleTab === 'student-data' && (
          <section className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-bold text-[#2D1A0E] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#F47A35]">badge</span>
                  Master Student Directory & Records
                </h2>
                <p className="text-xs font-medium text-[#9B7B52]">
                  Preview student profiles, meal preferences, hostel categories, and upcoming meal statuses. Click any student to view full details.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreateAdminModal(true)}
                  className="px-4 py-2 bg-[#2D1A0E] hover:bg-[#3E2718] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">person_add</span>
                  Create Admin User
                </button>
              </div>
            </div>

            {/* Filter & Search Toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative w-full md:w-96">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#BFA37A] text-[20px]">
                  search
                </span>
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student name, reg no, mess ID, room..."
                  className="w-full pl-10 pr-4 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
                />
              </div>

              <div className="flex gap-2 w-full md:w-auto">
                <select
                  value={studentCampusFilter}
                  onChange={(e) => setStudentCampusFilter(e.target.value)}
                  className="px-3 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-semibold text-[#5C3D1E]"
                >
                  <option value="ALL">All Categories</option>
                  <option value="Inmate">Inmate</option>
                  <option value="Lakeside">Lakeside</option>
                  <option value="Outmess">Outmess</option>
                </select>
              </div>
            </div>

            {/* Master Student Data Table */}
            <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table text-left text-sm">
                  <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold text-xs uppercase border-b border-[#EFDCB4]">
                    <tr>
                      <th className="py-3.5 px-4">Photo</th>
                      <th className="py-3.5 px-4">Mess ID</th>
                      <th className="py-3.5 px-4">Student Name</th>
                      <th className="py-3.5 px-4">Meal Preference</th>
                      <th className="py-3.5 px-4">Category</th>
                      <th className="py-3.5 px-4 text-center">Upcoming Meal Status</th>
                      <th className="py-3.5 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFDCB4]">
                    {masterStudents
                      .filter((row) => {
                        if (studentCampusFilter !== 'ALL' && row.category !== studentCampusFilter) return false;
                        if (!studentSearch) return true;
                        const q = studentSearch.toLowerCase();
                        return (
                          row.name.toLowerCase().includes(q) ||
                          row.regNo.toLowerCase().includes(q) ||
                          row.messId.toLowerCase().includes(q) ||
                          row.department.toLowerCase().includes(q) ||
                          row.roomNo.toLowerCase().includes(q)
                        );
                      })
                      .map((row) => (
                        <tr
                          key={row.id}
                          onClick={() => handleOpenMasterStudentModal(row)}
                          className="hover:bg-[#FDF7EA] transition-colors cursor-pointer"
                        >
                          <td className="py-3 px-4">
                            <img
                              src={row.photo}
                              alt={row.name}
                              className="w-10 h-10 rounded-full object-cover border border-[#E3CB9B]"
                            />
                          </td>
                          <td className="py-3 px-4 font-mono text-xs font-bold text-[#F47A35]">{row.messId}</td>
                          <td className="py-3 px-4 font-bold text-[#2D1A0E]">
                            {row.name}
                            <span className="block text-[11px] font-normal text-[#9B7B52]">Reg: {row.regNo}</span>
                          </td>
                          <td className="py-3 px-4 text-xs font-bold">
                            {row.dietaryPref === 'Veg' ? (
                              <span className="px-2.5 py-1 bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/30 rounded-lg inline-flex items-center gap-1">
                                🥦 Veg
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 bg-[#dc2626]/10 text-[#dc2626] border border-[#dc2626]/30 rounded-lg inline-flex items-center gap-1">
                                🍗 Non-Veg
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold text-[#5C3D1E]">
                            <span className="px-2.5 py-1 bg-[#F7EEDA] text-[#2D1A0E] rounded-lg border border-[#E3CB9B]">
                              {row.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {row.upcomingMealStatus === 'OPTED_IN' && (
                              <span className="px-3 py-1 bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/30 text-xs font-extrabold rounded-full">
                                🟢 Opted In
                              </span>
                            )}
                            {row.upcomingMealStatus === 'SKIPPED' && (
                              <span className="px-3 py-1 bg-[#dc2626]/10 text-[#dc2626] border border-[#dc2626]/30 text-xs font-extrabold rounded-full">
                                🔴 Skipped
                              </span>
                            )}
                            {row.upcomingMealStatus === 'PENDING' && (
                              <span className="px-3 py-1 bg-[#ea580c]/10 text-[#ea580c] border border-[#ea580c]/30 text-xs font-extrabold rounded-full">
                                🟠 Pending Scan
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenMasterStudentModal(row);
                              }}
                              className="px-3 py-1 bg-[#F47A35]/10 hover:bg-[#F47A35] text-[#F47A35] hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 mx-auto"
                            >
                              <span className="material-symbols-outlined text-[16px]">visibility</span>
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODULE 5: BILLING                                             */}
        {/* ------------------------------------------------------------- */}
        {activeModuleTab === 'billing' && (
          <section className="space-y-6 animate-fade-in">
            {/* Header & Controls Toolbar */}
            <div className="bg-white p-5 rounded-2xl border border-[#EFDCB4] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#2D1A0E] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#F47A35]">receipt_long</span>
                  Monthly Mess Rate & Billing Calculation
                </h2>
                <p className="text-xs font-medium text-[#9B7B52] mt-0.5">
                  Select billing period to calculate actual mess expenditure, chargeable days, and daily rate. Click any line item to inspect month purchases & logs.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                {/* Month Selector */}
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-[#9B7B52] mb-1">Billing Month</label>
                  <select
                    value={billingMonth}
                    onChange={(e) => setBillingMonth(e.target.value)}
                    className="px-3.5 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35] cursor-pointer"
                  >
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Year Selector */}
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-[#9B7B52] mb-1">Billing Year</label>
                  <select
                    value={billingYear}
                    onChange={(e) => setBillingYear(e.target.value)}
                    className="px-3.5 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35] cursor-pointer"
                  >
                    {['2026', '2025', '2024'].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                {/* PDF Download Buttons */}
                <div className="flex items-end gap-2">
                  <button
                    onClick={handleDownloadBillingPdf}
                    className="px-3.5 py-2 bg-[#F47A35] hover:bg-[#D45E1A] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                    <span>Mess Rate Summary PDF</span>
                  </button>
                  <button
                    onClick={handleDownloadBreakdownPdf}
                    className="px-3.5 py-2 bg-[#2D1A0E] hover:bg-[#3E2718] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    <span>Download Breakdown PDF</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Calculation of Daily Mess Rate Card */}
            <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden">
              <div className="p-5 border-b border-[#EFDCB4] bg-[#FDF7EA] flex justify-between items-center">
                <div>
                  <h3 className="text-base font-extrabold text-[#2D1A0E] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#F47A35]">calculate</span>
                    Calculation of Daily Mess Rate
                  </h3>
                  <p className="text-xs text-[#9B7B52] mt-0.5">
                    Official breakdown for <span className="font-bold text-[#2D1A0E]">{billingMonth} {billingYear}</span>
                  </p>
                </div>
                <span className="px-3 py-1 bg-[#F47A35]/10 text-[#F47A35] text-xs font-bold rounded-full border border-[#F47A35]/20">
                  {billingMonth} {billingYear} Cycle
                </span>
              </div>

              <div className="p-5 space-y-4">
                <div className="overflow-x-auto">
                  <table className="data-table text-left text-sm">
                    <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold text-xs uppercase border-b border-[#EFDCB4]">
                      <tr>
                        <th className="py-3 px-4">Line Item / Expense Head</th>
                        <th className="py-3 px-4 text-center">Source Details</th>
                        <th className="py-3 px-4 text-right">Amount (₹)</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFDCB4]">
                      
                      {/* 1. Opening Stock */}
                      <tr
                        onClick={() => setBillingModal({ isOpen: true, title: `Opening Stock Valuation (${billingMonth} ${billingYear})`, type: 'STOCK' })}
                        className="hover:bg-[#FDF7EA] transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 font-bold text-[#2D1A0E] flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-[#F7EEDA] text-[#F47A35] text-xs font-black flex items-center justify-center">1</span>
                          <span>Opening Stock</span>
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs text-[#9B7B52]">Beginning stock inventory value</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-[#2D1A0E]">₹{billingOpeningStock.toLocaleString()}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="text-xs font-bold text-[#F47A35] group-hover:underline flex items-center justify-center gap-1">
                            <span>Inspect</span>
                            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                          </span>
                        </td>
                      </tr>

                      {/* 2. Food Purchase */}
                      <tr
                        onClick={() => setBillingModal({ isOpen: true, title: `Food Purchases Log (${billingMonth} ${billingYear})`, type: 'FOOD' })}
                        className="hover:bg-[#FDF7EA] transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 font-bold text-[#2D1A0E] flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-[#F7EEDA] text-[#F47A35] text-xs font-black flex items-center justify-center">2</span>
                          <span>Food Purchase</span>
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs text-[#9B7B52]">{monthFoodPurchases.length} food purchase entries logged</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-[#2D1A0E]">₹{totalFoodPurchasesAmount.toLocaleString()}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="text-xs font-bold text-[#F47A35] group-hover:underline flex items-center justify-center gap-1">
                            <span>View All Purchases</span>
                            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                          </span>
                        </td>
                      </tr>

                      {/* 3. Gas/Fuel Operational */}
                      <tr
                        onClick={() => setBillingModal({ isOpen: true, title: `Gas/Fuel Operational Expenses (${billingMonth} ${billingYear})`, type: 'GAS' })}
                        className="hover:bg-[#FDF7EA] transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 font-bold text-[#2D1A0E] flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-[#F7EEDA] text-[#F47A35] text-xs font-black flex items-center justify-center">3</span>
                          <span>Gas / Fuel Operational</span>
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs text-[#9B7B52]">LPG Cylinders & kitchen fuel expenses</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-[#2D1A0E]">₹{totalGasExpensesAmount.toLocaleString()}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="text-xs font-bold text-[#F47A35] group-hover:underline flex items-center justify-center gap-1">
                            <span>View Gas Expenses</span>
                            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                          </span>
                        </td>
                      </tr>

                      {/* 4. Administration */}
                      <tr
                        onClick={() => setBillingModal({ isOpen: true, title: `Administrative Expenses Breakdown (${billingMonth} ${billingYear})`, type: 'ADMIN' })}
                        className="hover:bg-[#FDF7EA] transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 font-bold text-[#2D1A0E] flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-[#F7EEDA] text-[#F47A35] text-xs font-black flex items-center justify-center">4</span>
                          <span>Administration</span>
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs text-[#9B7B52]">Workers Salary, Allowance, Stationary & Misc</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-[#2D1A0E]">₹{totalAdminExpenseAmount.toLocaleString()}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="text-xs font-bold text-[#F47A35] group-hover:underline flex items-center justify-center gap-1">
                            <span>View Breakdown</span>
                            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                          </span>
                        </td>
                      </tr>

                      {/* 5. Closing Stock */}
                      <tr
                        onClick={() => setBillingModal({ isOpen: true, title: `Closing Stock Valuation (${billingMonth} ${billingYear})`, type: 'STOCK' })}
                        className="hover:bg-[#FDF7EA] transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 font-bold text-[#2D1A0E] flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-[#F7EEDA] text-[#dc2626] text-xs font-black flex items-center justify-center">5</span>
                          <span>Closing Stock</span>
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs text-[#9B7B52]">End-of-month remaining inventory stock</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-[#dc2626]">- ₹{billingClosingStock.toLocaleString()}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="text-xs font-bold text-[#F47A35] group-hover:underline flex items-center justify-center gap-1">
                            <span>Inspect</span>
                            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                          </span>
                        </td>
                      </tr>

                      {/* Actual Expenditure Row */}
                      <tr className="bg-[#FDF7EA] font-extrabold border-t-2 border-[#E3CB9B]">
                        <td colSpan={2} className="py-4 px-4 text-[#2D1A0E]">
                          Actual Expenditure <span className="text-xs font-normal text-[#9B7B52]">(1 + 2 + 3 + 4 - 5)</span>
                        </td>
                        <td className="py-4 px-4 text-right font-mono text-base text-[#F47A35]">₹{actualCost.toLocaleString()}</td>
                        <td></td>
                      </tr>

                      {/* Chargeable Days Row */}
                      <tr className="bg-white font-bold">
                        <td colSpan={2} className="py-4 px-4 text-[#2D1A0E]">
                          Chargeable Days <span className="text-xs font-normal text-[#9B7B52]">(Sum of all students' opted-in days overall)</span>
                        </td>
                        <td className="py-4 px-4 text-right font-mono text-sm text-[#2D1A0E]">{billingChargeableDays.toLocaleString()} Days</td>
                        <td></td>
                      </tr>

                    </tbody>
                  </table>
                </div>

                {/* Highlighted Blue Box for Mess Daily Rate */}
                <div className="bg-[#F47A35] text-white p-6 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full text-white inline-block">
                      Final Calculation Result
                    </span>
                    <h4 className="text-xl font-extrabold">Mess Daily Rate</h4>
                    <p className="text-xs text-white/80">
                      Actual Cost (₹{actualCost.toLocaleString()}) ÷ Chargeable Days ({billingChargeableDays.toLocaleString()})
                    </p>
                  </div>

                  <div className="bg-white/15 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 text-center">
                    <span className="text-3xl font-black tracking-tight">₹{messDailyRate.toFixed(2)}</span>
                    <span className="text-xs font-bold block opacity-90 mt-0.5">/ student / day</span>
                  </div>
                </div>

              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* BREAKDOWN EXPENSES STATEMENT                                  */}
            {/* ------------------------------------------------------------- */}
            <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs p-6 space-y-6">
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#EFDCB4] pb-4">
                <div>
                  <h3 className="text-lg font-extrabold text-[#2D1A0E] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#F47A35]">receipt_long</span>
                    Breakdown Expenses Statement - {billingMonth} {billingYear}
                  </h3>
                  <p className="text-xs text-[#9B7B52] mt-0.5">
                    Itemized breakdown statements of food purchases, stock valuations, operational & administrative expenses
                  </p>
                </div>

                <button
                  onClick={handleDownloadBreakdownPdf}
                  className="px-4 py-2 bg-[#2D1A0E] hover:bg-[#3E2718] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                  <span>Download Breakdown PDF</span>
                </button>
              </div>

              {/* 1. Food & Grocery Purchase */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#2D1A0E] flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#F47A35]/10 text-[#F47A35] text-xs flex items-center justify-center font-bold">1</span>
                  Food & Grocery Purchase
                </h4>
                <div className="overflow-x-auto border border-[#EFDCB4] rounded-xl">
                  <table className="data-table text-left text-xs">
                    <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold uppercase border-b border-[#EFDCB4]">
                      <tr>
                        <th className="py-2.5 px-3">Sl No</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Item Name</th>
                        <th className="py-2.5 px-3">Quantity</th>
                        <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFDCB4]">
                      {monthFoodPurchases.map((fp, idx) => (
                        <tr key={fp.id} className="hover:bg-[#FDF7EA]">
                          <td className="py-2.5 px-3 text-[#9B7B52]">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-mono text-[#5C3D1E]">{fp.date}</td>
                          <td className="py-2.5 px-3 font-bold text-[#2D1A0E]">{fp.item}</td>
                          <td className="py-2.5 px-3 font-mono text-[#6B4A28]">{fp.qty}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2D1A0E]">₹{fp.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                      <tr className="bg-[#FDF7EA] font-bold border-t border-[#E3CB9B]">
                        <td colSpan={4} className="py-3 px-3 text-[#2D1A0E]">Total Food & Grocery Purchase</td>
                        <td className="py-3 px-3 text-right font-mono text-sm text-[#F47A35]">₹{totalFoodPurchasesAmount.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2. Opening Stock */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-extrabold text-sm text-[#2D1A0E] flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#F47A35]/10 text-[#F47A35] text-xs flex items-center justify-center font-bold">2</span>
                    Opening Stock
                  </h4>
                  <span className="text-[11px] font-semibold text-[#16a34a] bg-[#16a34a]/10 px-2.5 py-0.5 rounded-full border border-[#16a34a]/30">
                    ⚡ Directly taken by app from previous month closing
                  </span>
                </div>
                <div className="overflow-x-auto border border-[#EFDCB4] rounded-xl">
                  <table className="data-table text-left text-xs">
                    <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold uppercase border-b border-[#EFDCB4]">
                      <tr>
                        <th className="py-2.5 px-3">Sl No</th>
                        <th className="py-2.5 px-3">Item Name</th>
                        <th className="py-2.5 px-3">Qty</th>
                        <th className="py-2.5 px-3 text-right">WAC Price (₹)</th>
                        <th className="py-2.5 px-3 text-right">Value (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFDCB4]">
                      {openingStockItems.map((op, idx) => (
                        <tr key={op.id} className="hover:bg-[#FDF7EA]">
                          <td className="py-2.5 px-3 text-[#9B7B52]">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-[#2D1A0E]">{op.itemName}</td>
                          <td className="py-2.5 px-3 font-mono text-[#6B4A28]">{op.qty}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#6B4A28]">₹{op.wacPrice}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2D1A0E]">₹{(op.qty * op.wacPrice).toLocaleString()}</td>
                        </tr>
                      ))}
                      <tr className="bg-[#FDF7EA] font-bold border-t border-[#E3CB9B]">
                        <td colSpan={4} className="py-3 px-3 text-[#2D1A0E]">Total Opening Stock</td>
                        <td className="py-3 px-3 text-right font-mono text-sm text-[#F47A35]">₹{billingOpeningStock.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. Closing Stock */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                  <h4 className="font-extrabold text-sm text-[#2D1A0E] flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#dc2626]/10 text-[#dc2626] text-xs flex items-center justify-center font-bold">3</span>
                    Closing Stock
                  </h4>
                  <span className="text-[11px] font-semibold text-[#9B7B52]">
                    (Added by admin after physical stock count at month end)
                  </span>
                </div>

                {/* Form to add closing stock item with Live Item Suggestions Dropdown */}
                {(() => {
                  const closingInputLower = newClosingName.trim().toLowerCase();
                  // Match items starting with input first, then containing input
                  const matches = closingInputLower
                    ? inventoryCatalog.filter(i => i.name.toLowerCase().startsWith(closingInputLower))
                    : [];
                  const fallbackMatches = closingInputLower && matches.length === 0
                    ? inventoryCatalog.filter(i => i.name.toLowerCase().includes(closingInputLower))
                    : [];
                  const closingSuggestions = [...matches, ...fallbackMatches].slice(0, 6);

                  const defaultWacRatesMap: Record<string, number> = {
                    'inv-cat-1': 40, 'inv-cat-2': 42, 'inv-cat-3': 52, 'inv-cat-4': 6,
                    'inv-cat-5': 190, 'inv-cat-6': 170, 'inv-cat-7': 30, 'inv-cat-8': 120,
                    'inv-cat-9': 317, 'inv-cat-10': 350, 'inv-cat-11': 420, 'inv-cat-12': 1850,
                    'inv-cat-13': 42, 'inv-cat-14': 360, 'inv-cat-15': 65, 'inv-cat-16': 480,
                    'inv-cat-17': 45, 'inv-cat-18': 40, 'inv-cat-19': 35, 'inv-cat-20': 110,
                  };

                  return (
                    <form onSubmit={handleAddClosingStockItem} className="bg-[#FDF7EA] p-3 rounded-xl border border-[#E3CB9B] grid grid-cols-1 md:grid-cols-4 gap-2 relative">
                      
                      {/* Item Name Input with Floating Suggestions Dropdown */}
                      <div className="relative">
                        <input
                          type="text"
                          value={newClosingName}
                          onChange={(e) => {
                            setNewClosingName(e.target.value);
                            setShowClosingSuggestions(true);
                          }}
                          onFocus={() => setShowClosingSuggestions(true)}
                          placeholder="Item Name (e.g. Rice, Beef...)"
                          className="w-full p-2 bg-white border border-[#E3CB9B] rounded-lg text-xs font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                        />

                        {/* Floating Dropdown Suggestion Menu */}
                        {showClosingSuggestions && closingSuggestions.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border-2 border-[#F47A35] rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-[#EFDCB4] animate-fade-in">
                            <div className="bg-[#F47A35] px-3 py-1.5 text-white text-[10px] font-black uppercase tracking-wider flex justify-between items-center">
                              <span>Select Stock Item Suggestion</span>
                              <span>{closingSuggestions.length} Matches</span>
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {closingSuggestions.map((item) => {
                                const wacPrice = defaultWacRatesMap[item.id] || 50;
                                return (
                                  <div
                                    key={item.id}
                                    onClick={() => {
                                      setNewClosingName(item.name);
                                      setNewClosingWac(wacPrice.toString());
                                      setShowClosingSuggestions(false);
                                    }}
                                    className="px-3 py-2 hover:bg-[#F47A35]/10 cursor-pointer transition-colors flex items-center justify-between group"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="material-symbols-outlined text-[16px] text-[#F47A35] group-hover:scale-110 transition-transform">
                                        inventory_2
                                      </span>
                                      <span className="font-extrabold text-xs text-[#2D1A0E] group-hover:text-[#F47A35]">
                                        {item.name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-mono font-semibold text-[#9B7B52] bg-[#F7EEDA] px-1.5 py-0.5 rounded">
                                        {item.unit}
                                      </span>
                                      <span className="text-[11px] font-mono font-black text-[#16a34a]">
                                        ₹{wacPrice}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      <input
                        type="number"
                        value={newClosingQty}
                        onChange={(e) => setNewClosingQty(e.target.value)}
                        placeholder="Physical Qty"
                        className="p-2 bg-white border border-[#E3CB9B] rounded-lg text-xs font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                      />
                      <input
                        type="number"
                        value={newClosingWac}
                        onChange={(e) => setNewClosingWac(e.target.value)}
                        placeholder="WAC Price (₹)"
                        className="p-2 bg-white border border-[#E3CB9B] rounded-lg text-xs font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                      />
                      <button
                        type="submit"
                        className="py-2 bg-[#F47A35] text-white font-bold text-xs rounded-lg hover:bg-[#D45E1A] cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        Add Closing Item
                      </button>
                    </form>
                  );
                })()}

                <div className="overflow-x-auto border border-[#EFDCB4] rounded-xl">
                  <table className="data-table text-left text-xs">
                    <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold uppercase border-b border-[#EFDCB4]">
                      <tr>
                        <th className="py-2.5 px-3">Sl No</th>
                        <th className="py-2.5 px-3">Item Name</th>
                        <th className="py-2.5 px-3">Qty</th>
                        <th className="py-2.5 px-3 text-right">WAC Price (₹)</th>
                        <th className="py-2.5 px-3 text-right">Value (₹)</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFDCB4]">
                      {closingStockItems.map((cl, idx) => (
                        <tr key={cl.id} className="hover:bg-[#FDF7EA]">
                          <td className="py-2.5 px-3 text-[#9B7B52]">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-[#2D1A0E]">{cl.itemName}</td>
                          <td className="py-2.5 px-3 font-mono text-[#6B4A28]">{cl.qty}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#6B4A28]">₹{cl.wacPrice}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#dc2626]">₹{(cl.qty * cl.wacPrice).toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => handleDeleteClosingStockItem(cl.id)}
                              className="p-1 text-[#dc2626] hover:bg-[#dc2626]/10 rounded cursor-pointer"
                              title="Delete Item"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-[#FDF7EA] font-bold border-t border-[#E3CB9B]">
                        <td colSpan={4} className="py-3 px-3 text-[#2D1A0E]">Total Closing Stock</td>
                        <td className="py-3 px-3 text-right font-mono text-sm text-[#dc2626]">₹{billingClosingStock.toLocaleString()}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. Actual Food Cost Calculation */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#2D1A0E] flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#F47A35]/10 text-[#F47A35] text-xs flex items-center justify-center font-bold">4</span>
                  Actual Food Cost Calculation
                </h4>
                <div className="bg-[#FDF7EA] p-4 rounded-xl border border-[#E3CB9B] space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[#6B4A28]">1. Total Food Purchase Amount:</span>
                    <span className="font-mono font-bold text-[#2D1A0E]">₹{totalFoodPurchasesAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6B4A28]">2. Add Opening Stock Amount:</span>
                    <span className="font-mono font-bold text-[#16a34a]">+ ₹{billingOpeningStock.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6B4A28]">3. Less Closing Stock Amount:</span>
                    <span className="font-mono font-bold text-[#dc2626]">- ₹{billingClosingStock.toLocaleString()}</span>
                  </div>
                  <div className="pt-2 border-t border-[#E3CB9B] flex justify-between items-center font-extrabold text-sm">
                    <span className="text-[#2D1A0E]">Actual Food Cost of Month (1 + 2 - 3):</span>
                    <span className="font-mono text-[#F47A35]">₹{actualFoodCost.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* 5. Operational Expenses */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#2D1A0E] flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#F47A35]/10 text-[#F47A35] text-xs flex items-center justify-center font-bold">5</span>
                  Operational Expenses
                </h4>
                <div className="overflow-x-auto border border-[#EFDCB4] rounded-xl">
                  <table className="data-table text-left text-xs">
                    <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold uppercase border-b border-[#EFDCB4]">
                      <tr>
                        <th className="py-2.5 px-3">Sl No</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Category Dropdown</th>
                        <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFDCB4]">
                      {monthOperationalExpenses.map((op, idx) => (
                        <tr key={op.id} className="hover:bg-[#FDF7EA]">
                          <td className="py-2.5 px-3 text-[#9B7B52]">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-mono text-[#5C3D1E]">{op.date}</td>
                          <td className="py-2.5 px-3">
                            <select
                              value={op.category}
                              onChange={(e) => {
                                const newCat = e.target.value as any;
                                setOpExpenses(opExpenses.map(o => o.id === op.id ? { ...o, category: newCat } : o));
                              }}
                              className="bg-white border border-[#E3CB9B] rounded-lg px-2 py-1 text-xs font-bold text-[#2D1A0E] cursor-pointer"
                            >
                              <option value="Gas/Fuel">Gas/Fuel</option>
                              <option value="Maintenance">Maintenance</option>
                              <option value="Utilities">Utilities</option>
                              <option value="Miscellaneous">Miscellaneous</option>
                              <option value="Other">Other</option>
                            </select>
                            <span className="ml-2 text-xs text-[#9B7B52]">({op.title})</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2D1A0E]">₹{op.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                      <tr className="bg-[#FDF7EA] font-bold border-t border-[#E3CB9B]">
                        <td colSpan={3} className="py-3 px-3 text-[#2D1A0E]">Total Operational Expenses</td>
                        <td className="py-3 px-3 text-right font-mono text-sm text-[#F47A35]">₹{totalOperationalExpensesAmount.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 6. Administrational Expenses */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#2D1A0E] flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#F47A35]/10 text-[#F47A35] text-xs flex items-center justify-center font-bold">6</span>
                  Administrational Expenses
                </h4>
                <div className="overflow-x-auto border border-[#EFDCB4] rounded-xl">
                  <table className="data-table text-left text-xs">
                    <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold uppercase border-b border-[#EFDCB4]">
                      <tr>
                        <th className="py-2.5 px-3">Sl No</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFDCB4]">
                      <tr>
                        <td className="py-2.5 px-3 text-[#9B7B52]">1</td>
                        <td className="py-2.5 px-3 font-bold text-[#2D1A0E]">Workers Salary</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2D1A0E]">₹{monthAdminRecord.salary.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-[#9B7B52]">2</td>
                        <td className="py-2.5 px-3 font-bold text-[#2D1A0E]">Committee Allowance</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2D1A0E]">₹{monthAdminRecord.allowance.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-[#9B7B52]">3</td>
                        <td className="py-2.5 px-3 font-bold text-[#2D1A0E]">Stationary Charges</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2D1A0E]">₹{monthAdminRecord.stationary.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-[#9B7B52]">4</td>
                        <td className="py-2.5 px-3 font-bold text-[#2D1A0E]">Miscellaneous Charges</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2D1A0E]">₹{monthAdminRecord.misc.toLocaleString()}</td>
                      </tr>
                      <tr className="bg-[#FDF7EA] font-bold border-t border-[#E3CB9B]">
                        <td colSpan={2} className="py-3 px-3 text-[#2D1A0E]">Total Administrational Expenses</td>
                        <td className="py-3 px-3 text-right font-mono text-sm text-[#F47A35]">₹{totalAdminExpenseAmount.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* HIGHLIGHTED GRAND TOTAL EXPENSE OF MONTH */}
              <div className="bg-gradient-to-br from-[#1e3a8a] to-[#F47A35] text-white p-6 rounded-2xl shadow-xl space-y-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/20 pb-4">
                  <div>
                    <span className="px-3 py-1 bg-white/20 text-white text-xs font-extrabold uppercase tracking-wider rounded-full inline-block mb-1">
                      Final Expense Aggregation
                    </span>
                    <h3 className="text-2xl font-black tracking-tight">
                      GRAND TOTAL EXPENSE OF MONTH {billingMonth.toUpperCase()} {billingYear}
                    </h3>
                  </div>

                  <div className="bg-white/15 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/20 text-right">
                    <span className="text-3xl font-black">₹{grandTotalMonthExpense.toLocaleString()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-semibold">
                  <div className="bg-white/10 p-3 rounded-xl border border-white/15">
                    <span className="opacity-80 block text-[11px] uppercase">Actual Food Cost</span>
                    <span className="text-base font-bold mt-0.5 block">₹{actualFoodCost.toLocaleString()}</span>
                  </div>

                  <div className="bg-white/10 p-3 rounded-xl border border-white/15">
                    <span className="opacity-80 block text-[11px] uppercase">Operational Expenses</span>
                    <span className="text-base font-bold mt-0.5 block">₹{totalOperationalExpensesAmount.toLocaleString()}</span>
                  </div>

                  <div className="bg-white/10 p-3 rounded-xl border border-white/15">
                    <span className="opacity-80 block text-[11px] uppercase">Administrational Expenses</span>
                    <span className="text-base font-bold mt-0.5 block">₹{totalAdminExpenseAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* INDIVIDUAL MONTHLY STUDENT BILLING TABLE & EXCEL EXPORT        */}
              {/* ------------------------------------------------------------- */}
              {(() => {
                // Days in calendar month
                const getDaysInMonth = (mName: string, yStr: string): number => {
                  const mIdx = [
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'
                  ].indexOf(mName);
                  const yNum = parseInt(yStr, 10) || 2026;
                  if (mIdx === -1) return 30;
                  return new Date(yNum, mIdx + 1, 0).getDate();
                };

                const totalDaysInMonth = getDaysInMonth(billingMonth, billingYear);
                const officialHolidaysCount = 1; // 1 official holiday day in current cycle
                const messOpenedDays = Math.max(0, totalDaysInMonth - officialHolidaysCount);
                const perDayRate = Math.round(messDailyRate || 85);

                // Build individual student billing records
                const studentBillingData = masterStudents.map((st, idx) => {
                  // `category` is only ever Inmate | Lakeside | Outmess. A 'Day Scholar'
                  // branch used to sit here and could never match.
                  const category = studentCategoryOverrideMap[st.messId] || st.category || 'Inmate';
                  
                  // Mess cut is ONLY when entire day (Breakfast + Lunch + Dinner) was skipped
                  const demoMessCutDaysMap: Record<string, number> = {
                    'MESS-2026-089': 4, // Rahul V Nair (4 full-day skips)
                    'MESS-2026-104': 2, // Ananya Sharma
                    'MESS-2026-112': 5, // Muhammed Shafi
                    'MESS-2026-145': 3, // Sneha P K
                    'MESS-2026-178': 1, // Vivek M
                    'MESS-2026-192': 0, // Archana S
                    'MESS-2026-210': 4, // Arjun K S
                    'MESS-2026-230': 2, // Lakshmi R
                  };
                  const messCutDays = demoMessCutDaysMap[st.messId] ?? 2;
                  const effectiveDays = Math.max(0, messOpenedDays - messCutDays);
                  
                  // Fine calculation (₹30 per missed confirmed meal)
                  const demoFineMap: Record<string, number> = {
                    'MESS-2026-089': 60,
                    'MESS-2026-104': 0,
                    'MESS-2026-112': 150,
                    'MESS-2026-145': 90,
                    'MESS-2026-178': 30,
                    'MESS-2026-192': 0,
                    'MESS-2026-210': 60,
                    'MESS-2026-230': 0,
                  };
                  // Was `st.fines`, which does not exist on MasterStudentDetail, so this
                  // silently fell back to 0 and under-billed every student who had a
                  // fine but no demoFineMap entry.
                  const fineAmount = demoFineMap[st.messId] ?? st.finesReceived ?? 0;

                  const foodBillAmount = effectiveDays * perDayRate;
                  const totalBillAmount = foodBillAmount + fineAmount;

                  return {
                    slNo: idx + 1,
                    id: st.messId,
                    name: st.name,
                    department: st.department,
                    category,
                    totalDays: totalDaysInMonth,
                    messOpened: messOpenedDays,
                    messCut: messCutDays,
                    effectiveDays,
                    perDay: perDayRate,
                    fine: fineAmount,
                    totalBill: totalBillAmount,
                  };
                });

                const handleExportStudentBillingExcel = () => {
                  let csv = `CUSAT Mess Individual Monthly Student Billing - ${billingMonth} ${billingYear}\n`;
                  csv += `Sl No,ID,Name,Department,Category,Total Days,Mess Opened,Mess Cut,Effective Days,Per Day (INR),Fine (INR),Total Bill (INR)\n`;
                  
                  studentBillingData.forEach(r => {
                    csv += `${r.slNo},"${r.id}","${r.name}","${r.department}","${r.category}",${r.totalDays},${r.messOpened},${r.messCut},${r.effectiveDays},${r.perDay},${r.fine},${r.totalBill}\n`;
                  });

                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.setAttribute('download', `CUSAT_Individual_Student_Billing_${billingMonth}_${billingYear}.csv`);
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                };

                return (
                  <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden space-y-4 p-5">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#EFDCB4] pb-4">
                      <div>
                        <h3 className="text-xl font-extrabold text-[#2D1A0E] flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#F47A35]">groups</span>
                          Individual Monthly Student Billing ({billingMonth} {billingYear})
                        </h3>
                        <p className="text-xs font-medium text-[#9B7B52] mt-0.5">
                          Calculated as: <span className="font-mono text-[#2D1A0E] font-bold">(Effective Days × Per Day Rate) + Fine</span>. Mess cut is granted ONLY when all 3 meals are skipped on a day.
                        </p>
                      </div>

                      <button
                        onClick={handleExportStudentBillingExcel}
                        className="px-4 py-2 bg-[#16a34a] hover:bg-[#15803d] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-[18px]">table_chart</span>
                        <span>Export Student Billing Excel</span>
                      </button>
                    </div>

                    <div className="overflow-x-auto border border-[#EFDCB4] rounded-xl">
                      <table className="data-table text-left text-xs">
                        <thead className="bg-[#FDF7EA] text-[#6B4A28] font-extrabold uppercase border-b border-[#EFDCB4]">
                          <tr>
                            <th className="py-3.5 px-3 text-center">Sl No</th>
                            <th className="py-3.5 px-3">ID</th>
                            <th className="py-3.5 px-4">Name</th>
                            <th className="py-3.5 px-3">Department</th>
                            <th className="py-3.5 px-3 text-center">Category</th>
                            <th className="py-3.5 px-3 text-center">Total Days</th>
                            <th className="py-3.5 px-3 text-center">Mess Opened</th>
                            <th className="py-3.5 px-3 text-center text-[#dc2626]">Mess Cut</th>
                            <th className="py-3.5 px-3 text-center text-[#16a34a]">Effective Days</th>
                            <th className="py-3.5 px-3 text-right">Per Day (₹)</th>
                            <th className="py-3.5 px-3 text-right text-[#dc2626]">Fine (₹)</th>
                            <th className="py-3.5 px-4 text-right bg-[#F47A35]/5 text-[#F47A35]">Total Bill (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EFDCB4]">
                          {studentBillingData.map((r) => (
                            <tr key={r.id} className="hover:bg-[#FDF7EA] transition-colors">
                              <td className="py-3 px-3 text-center font-mono font-bold text-[#9B7B52]">{r.slNo}</td>
                              <td className="py-3 px-3 font-mono font-bold text-[#F47A35]">{r.id}</td>
                              <td className="py-3 px-4 font-extrabold text-[#2D1A0E]">{r.name}</td>
                              <td className="py-3 px-3 font-medium text-[#6B4A28]">{r.department}</td>
                              
                              {/* Read-Only Category Badge (Editable only in Student Data Tab) */}
                              <td className="py-3 px-3 text-center">
                                <span className="px-2.5 py-1 bg-[#F7EEDA] text-[#2D1A0E] font-bold text-xs rounded-lg border border-[#E3CB9B] inline-block">
                                  {r.category}
                                </span>
                              </td>

                              <td className="py-3 px-3 text-center font-mono font-semibold text-[#5C3D1E]">{r.totalDays}</td>
                              <td className="py-3 px-3 text-center font-mono font-semibold text-[#5C3D1E]">{r.messOpened}</td>
                              <td className="py-3 px-3 text-center font-mono font-bold text-[#dc2626] bg-[#dc2626]/5">{r.messCut}</td>
                              <td className="py-3 px-3 text-center font-mono font-bold text-[#16a34a] bg-[#16a34a]/5">{r.effectiveDays}</td>
                              <td className="py-3 px-3 text-right font-mono font-bold text-[#F47A35]">₹{r.perDay}</td>
                              <td className="py-3 px-3 text-right font-mono font-bold text-[#dc2626]">₹{r.fine}</td>
                              <td className="py-3 px-4 text-right font-mono font-black text-sm text-[#F47A35] bg-[#F47A35]/5">
                                ₹{r.totalBill.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-[#FDF7EA] font-black text-xs border-t-2 border-[#E3CB9B] text-[#2D1A0E]">
                          <tr>
                            <td colSpan={5} className="py-4 px-4 uppercase tracking-wider">MONTHLY STUDENT BILLING TOTALS:</td>
                            <td className="py-4 px-3 text-center font-mono">-</td>
                            <td className="py-4 px-3 text-center font-mono">{messOpenedDays}</td>
                            <td className="py-4 px-3 text-center font-mono text-[#dc2626]">
                              {studentBillingData.reduce((acc, r) => acc + r.messCut, 0)} cuts
                            </td>
                            <td className="py-4 px-3 text-center font-mono text-[#16a34a]">
                              {studentBillingData.reduce((acc, r) => acc + r.effectiveDays, 0)} days
                            </td>
                            <td className="py-4 px-3 text-right font-mono text-[#F47A35]">₹{perDayRate}</td>
                            <td className="py-4 px-3 text-right font-mono text-[#dc2626]">
                              ₹{studentBillingData.reduce((acc, r) => acc + r.fine, 0).toLocaleString()}
                            </td>
                            <td className="py-4 px-4 text-right font-mono text-sm text-[#F47A35] bg-[#F47A35]/10">
                              ₹{studentBillingData.reduce((acc, r) => acc + r.totalBill, 0).toLocaleString()}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}

            </div>
          </section>
        )}
        {/* ------------------------------------------------------------- */}
        {/* MODULE 6: PAYMENTS                                            */}
        {/* ------------------------------------------------------------- */}
        {/* ------------------------------------------------------------- */}
        {/* MODULE 6: PAYMENTS                                            */}
        {/* ------------------------------------------------------------- */}
        {activeModuleTab === 'payments' && (() => {
          const currentKey = `${billingMonth}-${billingYear}`;
          const isPublished = !!isBillPublishedMap[currentKey];
          const { isLocked, lockDateFormatted } = checkIsBillLocked(billingMonth, billingYear, isPublished);

          return (
            <section className="space-y-6 animate-fade-in">
              
              {/* Controls Toolbar */}
              <div className="bg-white p-5 rounded-2xl border border-[#EFDCB4] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[22px] font-extrabold text-[#2D1A0E] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#F47A35]">payments</span>
                      Student Monthly Payments & Status
                    </h2>
                    {isLocked ? (
                      <span className="px-3 py-1 bg-[#9B7B52]/10 text-[#6B4A28] border border-[#9B7B52]/30 text-xs font-black rounded-full flex items-center gap-1">
                        🔒 Published & Frozen
                      </span>
                    ) : isPublished ? (
                      <span className="px-3 py-1 bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/30 text-xs font-black rounded-full flex items-center gap-1">
                        🟢 Bill Published
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-[#ea580c]/10 text-[#ea580c] border border-[#ea580c]/30 text-xs font-black rounded-full flex items-center gap-1">
                        🟠 Draft / Not Published
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-[#9B7B52] mt-0.5">
                    Track student payment completion, verify UTR reference numbers, toggle bill publication, and export billing spreadsheets.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  {/* Billing Period Selectors */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-[#9B7B52] mb-1">Billing Month</label>
                    <select
                      value={billingMonth}
                      onChange={(e) => setBillingMonth(e.target.value)}
                      className="px-3.5 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35] cursor-pointer"
                    >
                      {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-[#9B7B52] mb-1">Billing Year</label>
                    <select
                      value={billingYear}
                      onChange={(e) => setBillingYear(e.target.value)}
                      className="px-3.5 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35] cursor-pointer"
                    >
                      {['2026', '2025', '2024'].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  {/* Publish / Finalized Button */}
                  <div className="flex items-end gap-2">
                    {isPublished ? (
                      // Was a raw <div onClick> claiming publication was
                      // permanent and refusing to unpublish - that duplicated
                      // (and contradicted) handleTogglePublishBill, which does
                      // now support a reasoned, audited reopen. Route here too.
                      <button
                        onClick={handleTogglePublishBill}
                        title={`Bill for ${billingMonth} ${billingYear} is published. Click to reopen.`}
                        className="px-3.5 py-2 bg-[#16a34a]/15 hover:bg-[#16a34a]/25 text-[#15803d] border border-[#16a34a]/30 font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">verified</span>
                        <span>Published & Frozen — click to reopen</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleTogglePublishBill}
                        className="px-3.5 py-2 bg-[#F47A35] hover:bg-[#D45E1A] text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[18px]">campaign</span>
                        <span>Publish Bill to Students</span>
                      </button>
                    )}

                    <button
                      onClick={handleExportBillingExcel}
                      className="px-3.5 py-2 bg-[#2D1A0E] hover:bg-[#3E2718] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[18px]">table_chart</span>
                      <span>Export Excel</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Overview Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Total Students */}
                <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#F47A35]/10 text-[#F47A35] flex items-center justify-center font-bold">
                    <span className="material-symbols-outlined">groups</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-[#9B7B52] block">Total Eligible Students</span>
                    <span className="text-xl font-black text-[#2D1A0E]">
                      {studentPaymentRecords.filter(r => r.month === billingMonth && r.year === billingYear).length}
                    </span>
                  </div>
                </div>

                {/* Total Paid */}
                <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#16a34a]/10 text-[#16a34a] flex items-center justify-center font-bold">
                    <span className="material-symbols-outlined">check_circle</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-[#9B7B52] block">Paid Students</span>
                    <span className="text-xl font-black text-[#16a34a]">
                      {studentPaymentRecords.filter(r => r.month === billingMonth && r.year === billingYear && r.status === 'PAID').length}
                    </span>
                  </div>
                </div>

                {/* Total Pending */}
                <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#ea580c]/10 text-[#ea580c] flex items-center justify-center font-bold">
                    <span className="material-symbols-outlined">pending_actions</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-[#9B7B52] block">Pending Students</span>
                    <span className="text-xl font-black text-[#ea580c]">
                      {studentPaymentRecords.filter(r => r.month === billingMonth && r.year === billingYear && r.status === 'PENDING').length}
                    </span>
                  </div>
                </div>

                {/* Bill Status */}
                <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#9B7B52]/10 text-[#2D1A0E] flex items-center justify-center font-bold">
                    <span className="material-symbols-outlined">campaign</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-[#9B7B52] block">Bill Status</span>
                    <span className="text-xs font-black text-[#2D1A0E]">
                      {isLocked ? '🔒 LOCKED' : isPublished ? '🟢 PUBLISHED' : '🟠 DRAFT'}
                    </span>
                  </div>
                </div>
              </div>

            {/* Search & Filter Toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="relative w-full md:w-80">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#9B7B52] text-[18px]">search</span>
                <input
                  type="text"
                  value={paymentSearchQuery}
                  onChange={(e) => setPaymentSearchQuery(e.target.value)}
                  placeholder="Search Name, ID, Dept, UTR..."
                  className="w-full pl-9 pr-4 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-medium focus:outline-none focus:border-[#F47A35]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-[#9B7B52] mr-2">Category:</label>
                  <select
                    value={paymentCategoryFilter}
                    onChange={(e) => setPaymentCategoryFilter(e.target.value as any)}
                    className="px-3 py-1.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] cursor-pointer"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="Inmate">Inmate</option>
                    <option value="Lakeside">Lakeside</option>
                    <option value="Outmess">Outmess</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-[#9B7B52] mr-2">Payment Status:</label>
                  <select
                    value={paymentStatusFilter}
                    onChange={(e) => setPaymentStatusFilter(e.target.value as any)}
                    className="px-3 py-1.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] cursor-pointer"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PAID">Paid 🟢</option>
                    <option value="PENDING">Pending 🟠</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Students Payment Table */}
            <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table text-left text-xs">
                  <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold uppercase border-b border-[#EFDCB4]">
                    <tr>
                      <th className="py-3 px-4">Sl No</th>
                      <th className="py-3 px-4">Mess ID</th>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4 text-right">Total Bill (₹)</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Ref UTR Number</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFDCB4]">
                    {studentPaymentRecords
                      .filter(r => r.month === billingMonth && r.year === billingYear)
                      .filter(r => {
                        if (paymentCategoryFilter !== 'ALL' && r.category !== paymentCategoryFilter) return false;
                        if (paymentStatusFilter !== 'ALL' && r.status !== paymentStatusFilter) return false;
                        if (paymentSearchQuery) {
                          const q = paymentSearchQuery.toLowerCase();
                          return (
                            r.name.toLowerCase().includes(q) ||
                            r.messId.toLowerCase().includes(q) ||
                            r.department.toLowerCase().includes(q) ||
                            r.utrRef.toLowerCase().includes(q)
                          );
                        }
                        return true;
                      })
                      .map((row, idx) => (
                        <tr key={row.id} className="hover:bg-[#FDF7EA] transition-colors">
                          <td className="py-3 px-4 text-[#9B7B52]">{idx + 1}</td>
                          <td className="py-3 px-4 font-mono font-bold text-[#F47A35]">{row.messId}</td>
                          <td className="py-3 px-4 font-bold text-[#2D1A0E]">{row.name}</td>
                          <td className="py-3 px-4 font-semibold text-[#6B4A28]">
                            <span className="px-2.5 py-0.5 bg-[#F7EEDA] rounded-md border border-[#E3CB9B]">
                              {row.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[#6B4A28]">{row.department}</td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold text-[#2D1A0E]">
                            ₹{row.totalBill.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <select
                              value={row.status}
                              onChange={(e) => {
                                const newStatus = e.target.value as 'PAID' | 'PENDING';
                                setStudentPaymentRecords(prev =>
                                  prev.map(r => r.id === row.id ? { ...r, status: newStatus } : r)
                                );
                              }}
                              className={`px-3 py-1 rounded-xl text-xs font-extrabold border cursor-pointer ${
                                row.status === 'PAID'
                                  ? 'bg-[#16a34a]/10 text-[#16a34a] border-[#16a34a]/30'
                                  : 'bg-[#ea580c]/10 text-[#ea580c] border-[#ea580c]/30'
                              }`}
                            >
                              <option value="PAID">Paid 🟢</option>
                              <option value="PENDING">Pending 🟠</option>
                            </select>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <input
                              type="text"
                              value={row.utrRef}
                              onChange={(e) => {
                                const val = e.target.value;
                                setStudentPaymentRecords(prev =>
                                  prev.map(r => r.id === row.id ? { ...r, utrRef: val } : r)
                                );
                              }}
                              placeholder="Type UTR (e.g. UPI/123)"
                              className="px-2.5 py-1 bg-white border border-[#E3CB9B] rounded-lg font-mono text-xs font-medium w-36 focus:outline-none focus:border-[#F47A35]"
                            />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleSavePaymentRow(row.id, row.status, row.utrRef)}
                                className="px-2.5 py-1 bg-[#F47A35] hover:bg-[#D45E1A] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => handleGenerateStudentBillPdf(row)}
                                className="px-2.5 py-1 bg-[#F7EEDA] hover:bg-[#EFDCB4] text-[#2D1A0E] font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                title="Print PDF Bill"
                              >
                                <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

          </section>
          );
        })()}

        {/* ------------------------------------------------------------- */}
        {/* MODULE 7: STOCKS (Weighted Average Cost Inventory)             */}
        {/* ------------------------------------------------------------- */}
        {activeModuleTab === 'stocks' && (() => {
          const MONTH_NAMES = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
          ];

          // Determine Read-Only Status
          const stocksKey = `${stocksMonth}-${stocksYear}`;
          const isStocksPublished = !!isBillPublishedMap[stocksKey];
          const { isLocked: isStocksLocked } = checkIsBillLocked(stocksMonth, stocksYear, isStocksPublished);
          const isStocksReadOnly = isStocksPublished || isStocksLocked;

          // Helper to parse numerical quantity from strings like "200 kg", "80 L", "300 pcs"
          const parseQty = (qStr: string): number => {
            if (!qStr) return 0;
            const match = qStr.match(/^([\d.]+)/);
            return match ? parseFloat(match[1]) : 0;
          };

          // Determine previous month & year
          const mIdx = MONTH_NAMES.indexOf(stocksMonth);
          const yearNum = parseInt(stocksYear, 10);
          let prevMonthName = 'December';
          let prevYearNum = yearNum - 1;
          if (mIdx > 0) {
            prevMonthName = MONTH_NAMES[mIdx - 1];
            prevYearNum = yearNum;
          }
          const prevYearStr = prevYearNum.toString();

          // Default Base Stock & Cost per unit mappings
          const defaultOpeningQtyMap: Record<string, number> = {
            'inv-cat-1': 100, // Ponni Rice
            'inv-cat-2': 50,  // Atta
            'inv-cat-3': 40,  // Milk
            'inv-cat-4': 150, // Eggs
            'inv-cat-5': 10,  // Chicken
            'inv-cat-6': 20,  // Oil
            'inv-cat-7': 60,  // Onions & Potatoes
            'inv-cat-8': 30,  // Toor Dal
            'inv-cat-9': 10,  // Spices Mix
            'inv-cat-10': 8,  // Tea
            'inv-cat-11': 5,  // Coffee
            'inv-cat-12': 4,  // LPG Cylinders
            'inv-cat-13': 25, // Sugar
          };

          const defaultWacMap: Record<string, number> = {
            'inv-cat-1': 49,
            'inv-cat-2': 42,
            'inv-cat-3': 52,
            'inv-cat-4': 6,
            'inv-cat-5': 190,
            'inv-cat-6': 130,
            'inv-cat-7': 30,
            'inv-cat-8': 120,
            'inv-cat-9': 260,
            'inv-cat-10': 350,
            'inv-cat-11': 420,
            'inv-cat-12': 1850,
            'inv-cat-13': 42,
          };

          // Prefix Search Filter
          const searchPrefixLower = stocksSearchPrefix.trim().toLowerCase();
          let filteredItems = inventoryCatalog;
          if (searchPrefixLower) {
            const prefixMatches = inventoryCatalog.filter(i => i.name.toLowerCase().startsWith(searchPrefixLower));
            filteredItems = prefixMatches.length > 0
              ? prefixMatches
              : inventoryCatalog.filter(i => i.name.toLowerCase().includes(searchPrefixLower));
          }

          // Build row data for each item
          let grandTotalOpeningValue = 0;
          let grandTotalPurchaseCost = 0;
          let grandTotalClosingValue = 0;
          let grandTotalConsumedCost = 0;

          const stockRows = filteredItems.map(item => {
            const currentKey = `${stocksMonth}-${stocksYear}-${item.id}`;
            const prevKey = `${prevMonthName}-${prevYearStr}-${item.id}`;

            // Opening Qty & WAC from previous month
            const defaultOpQty = defaultOpeningQtyMap[item.id] ?? 20;
            const openingQty = physicalClosingStockMap[prevKey] !== undefined
              ? physicalClosingStockMap[prevKey]
              : defaultOpQty;

            const baseWac = defaultWacMap[item.id] ?? 50;
            const openingValue = openingQty * baseWac;

            // Monthly Purchases from foodPurchases log
            const monthPurchases = foodPurchases.filter(p => p.month === stocksMonth && p.year === stocksYear && (
              p.item.toLowerCase().includes(item.name.toLowerCase().split(' ')[0]) ||
              item.name.toLowerCase().includes(p.item.toLowerCase().split(' ')[0])
            ));

            const purchaseQty = monthPurchases.reduce((acc, p) => acc + parseQty(p.qty), 0);
            const purchaseCost = monthPurchases.reduce((acc, p) => acc + (p.amount || 0), 0);

            // WAC Calculation = (Opening Value + Purchase Cost) / (Opening Qty + Purchase Qty)
            const totalQty = openingQty + purchaseQty;
            const totalCost = openingValue + purchaseCost;
            const wac = totalQty > 0 ? totalCost / totalQty : baseWac;

            // Physical Closing Qty (Admin entered or default)
            const defaultClosingQty = Math.max(0, Math.round(totalQty * 0.25));
            const physicalClosingQty = physicalClosingStockMap[currentKey] !== undefined
              ? physicalClosingStockMap[currentKey]
              : defaultClosingQty;

            // Consumed Qty, Closing Value, Consumed Cost
            const consumedQty = Math.max(0, openingQty + purchaseQty - physicalClosingQty);
            const closingValue = physicalClosingQty * wac;
            const consumedCost = consumedQty * wac;

            grandTotalOpeningValue += openingValue;
            grandTotalPurchaseCost += purchaseCost;
            grandTotalClosingValue += closingValue;
            grandTotalConsumedCost += consumedCost;

            return {
              item,
              openingQty,
              openingValue,
              purchaseQty,
              purchaseCost,
              wac,
              physicalClosingQty,
              consumedQty,
              closingValue,
              consumedCost,
            };
          });

          return (
            <section className="space-y-6 animate-fade-in">
              
              {/* Controls Toolbar */}
              <div className="bg-white p-5 rounded-2xl border border-[#EFDCB4] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[22px] font-extrabold text-[#2D1A0E] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#F47A35]">inventory_2</span>
                      Stocks & Weighted Average Cost (WAC) Ledger
                    </h2>
                    {isStocksReadOnly ? (
                      <span className="px-3 py-1 bg-[#9B7B52]/10 text-[#6B4A28] border border-[#9B7B52]/30 text-xs font-black rounded-full flex items-center gap-1">
                        🔒 Read-Only (Bill {isStocksLocked ? 'Locked' : 'Published'})
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/30 text-xs font-black rounded-full flex items-center gap-1">
                        ✏️ Editable Stock Log
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-[#9B7B52] mt-0.5">
                    Opening & Purchase stock auto-calculated. Admins log Physical Closing Qty; WAC & Consumed Costs update automatically.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  {/* Period Dropdowns: Month & Year (Default = Current Month) */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-[#9B7B52] mb-1">Stock Month</label>
                    <select
                      value={stocksMonth}
                      onChange={(e) => setStocksMonth(e.target.value)}
                      className="px-3.5 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35] cursor-pointer"
                    >
                      {MONTH_NAMES.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-[#9B7B52] mb-1">Stock Year</label>
                    <select
                      value={stocksYear}
                      onChange={(e) => setStocksYear(e.target.value)}
                      className="px-3.5 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35] cursor-pointer"
                    >
                      {['2026', '2025', '2024'].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Read-Only Alert Banner if Published */}
              {isStocksReadOnly && (
                <div className="p-4 bg-[#9B7B52]/10 border border-[#9B7B52]/30 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold text-[#5C3D1E]">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[24px] text-[#9B7B52]">lock</span>
                    <div>
                      <h4 className="font-extrabold text-[#2D1A0E] text-sm flex items-center gap-1.5">
                        🔒 Read-Only Mode — Bill Published
                      </h4>
                      <p className="text-[#6B4A28] font-medium mt-0.5">
                        The billing record for <span className="font-bold text-[#2D1A0E]">{stocksMonth} {stocksYear}</span> is published. Physical stock quantities are frozen and cannot be edited.
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-[#9B7B52] text-white text-[10px] font-black rounded-lg uppercase tracking-wider">
                    FROZEN
                  </span>
                </div>
              )}

              {/* Top Summary Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs">
                  <span className="text-[10px] font-extrabold uppercase text-[#9B7B52] block mb-1">Total Opening Stock</span>
                  <span className="text-xl font-black text-[#2D1A0E]">₹{grandTotalOpeningValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className="text-[10px] font-medium text-[#9B7B52] block mt-0.5">Carried from previous month</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs">
                  <span className="text-[10px] font-extrabold uppercase text-[#9B7B52] block mb-1">Monthly Purchases</span>
                  <span className="text-xl font-black text-[#F47A35]">₹{grandTotalPurchaseCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className="text-[10px] font-medium text-[#9B7B52] block mt-0.5">Food purchases logged in Ledger</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs">
                  <span className="text-[10px] font-extrabold uppercase text-[#9B7B52] block mb-1">Total Closing Stock</span>
                  <span className="text-xl font-black text-[#16a34a]">₹{grandTotalClosingValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className="text-[10px] font-medium text-[#9B7B52] block mt-0.5">Physical closing stock value</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs">
                  <span className="text-[10px] font-extrabold uppercase text-[#9B7B52] block mb-1">Total Consumed Cost</span>
                  <span className="text-xl font-black text-[#dc2626]">₹{grandTotalConsumedCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className="text-[10px] font-medium text-[#9B7B52] block mt-0.5">Actual food expenditure</span>
                </div>
              </div>

              {/* Prefix Search Bar & Table Controls */}
              <div className="bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="relative w-full md:w-80">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#9B7B52] text-[18px]">search</span>
                  <input
                    type="text"
                    value={stocksSearchPrefix}
                    onChange={(e) => setStocksSearchPrefix(e.target.value)}
                    placeholder="Search item name (e.g. B, Be, Rice)..."
                    className="w-full pl-9 pr-4 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-semibold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                  />
                  {stocksSearchPrefix && (
                    <button
                      onClick={() => setStocksSearchPrefix('')}
                      className="absolute right-3 top-2.5 text-[#9B7B52] hover:text-[#2D1A0E] text-xs font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 bg-[#F47A35]/10 text-[#F47A35] text-xs font-bold rounded-lg border border-[#F47A35]/20">
                    Showing {stockRows.length} catalog items
                  </span>
                  <span className="px-3 py-1 bg-[#16a34a]/10 text-[#16a34a] text-xs font-bold rounded-lg border border-[#16a34a]/20">
                    Balance Check: Opening + Purchase = Closing + Consumed
                  </span>
                </div>
              </div>

              {/* Stocks WAC Ledger Table */}
              <div className="bg-white rounded-2xl border border-[#EFDCB4] shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data-table text-left text-xs">
                    <thead className="bg-[#FDF7EA] text-[#6B4A28] font-extrabold uppercase border-b border-[#EFDCB4]">
                      <tr>
                        <th className="py-3.5 px-4">Item Name</th>
                        <th className="py-3.5 px-3">Unit</th>
                        <th className="py-3.5 px-3 text-right">Opening Qty</th>
                        <th className="py-3.5 px-3 text-right">Purchase Qty</th>
                        <th className="py-3.5 px-3 text-right">Purchase Cost (₹)</th>
                        <th className="py-3.5 px-3 text-right">WAC (₹/unit)</th>
                        <th className="py-3.5 px-4 text-center bg-[#F47A35]/5 border-x border-[#F47A35]/20">
                          Physical Closing Qty {isStocksReadOnly ? '🔒' : '✏️'}
                        </th>
                        <th className="py-3.5 px-3 text-right">Consumed Qty</th>
                        <th className="py-3.5 px-3 text-right">Closing Value (₹)</th>
                        <th className="py-3.5 px-4 text-right bg-[#dc2626]/5 text-[#dc2626]">Consumed Cost (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFDCB4]">
                      {stockRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-[#9B7B52] font-medium">
                            No inventory items matching search prefix "{stocksSearchPrefix}".
                          </td>
                        </tr>
                      ) : (
                        stockRows.map(({ item, openingQty, purchaseQty, purchaseCost, wac, physicalClosingQty, consumedQty, closingValue, consumedCost }) => (
                          <tr key={item.id} className="hover:bg-[#FDF7EA] transition-colors">
                            <td className="py-3 px-4 font-bold text-[#2D1A0E]">{item.name}</td>
                            <td className="py-3 px-3 font-mono text-[#9B7B52]">{item.unit}</td>
                            <td className="py-3 px-3 text-right font-mono text-[#5C3D1E]">{openingQty}</td>
                            <td className="py-3 px-3 text-right font-mono font-semibold text-[#F47A35]">{purchaseQty}</td>
                            <td className="py-3 px-3 text-right font-mono text-[#5C3D1E]">₹{purchaseCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                            <td className="py-3 px-3 text-right font-mono font-extrabold text-[#F47A35]">
                              ₹{wac.toFixed(2)}
                            </td>

                            {/* Physical Closing Qty - Editable by Admin (or Read-Only if Published/Locked) */}
                            <td className="py-2.5 px-4 text-center bg-[#F47A35]/5 border-x border-[#F47A35]/20">
                              {isStocksReadOnly ? (
                                <span className="font-mono font-black text-sm text-[#2D1A0E]">
                                  {physicalClosingQty} {item.unit}
                                </span>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={physicalClosingQty}
                                    onChange={(e) => handleUpdatePhysicalClosingStock(item.id, parseFloat(e.target.value))}
                                    className="w-20 px-2 py-1 bg-white border border-[#F47A35] rounded-lg text-center font-mono font-bold text-xs text-[#2D1A0E] focus:outline-none focus:ring-2 focus:ring-[#F47A35]/30"
                                  />
                                  <span className="text-[10px] text-[#9B7B52] font-medium">{item.unit}</span>
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-semibold text-[#6B4A28]">{consumedQty}</td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-[#16a34a]">
                              ₹{closingValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black text-sm text-[#dc2626] bg-[#dc2626]/5">
                              ₹{consumedCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-[#FDF7EA] font-black text-xs border-t-2 border-[#E3CB9B] text-[#2D1A0E]">
                      <tr>
                        <td colSpan={2} className="py-4 px-4 uppercase tracking-wider">TOTAL MONETARY BALANCE:</td>
                        <td className="py-4 px-3 text-right font-mono">₹{grandTotalOpeningValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="py-4 px-3 text-right font-mono text-[#F47A35]">-</td>
                        <td className="py-4 px-3 text-right font-mono text-[#F47A35]">₹{grandTotalPurchaseCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="py-4 px-3 text-right font-mono text-[#F47A35]">-</td>
                        <td className="py-4 px-4 text-center bg-[#F47A35]/5 border-x border-[#F47A35]/20 text-[#F47A35]">TOTALS</td>
                        <td className="py-4 px-3 text-right font-mono">-</td>
                        <td className="py-4 px-3 text-right font-mono text-[#16a34a]">₹{grandTotalClosingValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="py-4 px-4 text-right font-mono text-sm text-[#dc2626] bg-[#dc2626]/10">
                          ₹{grandTotalConsumedCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

            </section>
          );
        })()}

      </div>

      {/* ------------------------------------------------------------- */}
      {/* BILLING LINE ITEM DRILL-DOWN MODAL                            */}
      {/* ------------------------------------------------------------- */}
      {billingModal.isOpen && (
        <div className="modal-scrim animate-fade-in">
          <div className="modal-panel max-w-2xl space-y-5 overflow-y-auto">
            
            <div className="flex justify-between items-center pb-3 border-b border-[#EFDCB4]">
              <h3 className="text-xl font-extrabold text-[#2D1A0E] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#F47A35]">list_alt</span>
                {billingModal.title}
              </h3>
              <button
                onClick={() => setBillingModal({ ...billingModal, isOpen: false })}
                className="w-8 h-8 rounded-full bg-[#F7EEDA] hover:bg-[#EFDCB4] text-[#9B7B52] hover:text-[#2D1A0E] flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Modal Content depending on type */}
            {billingModal.type === 'FOOD' && (
              <div className="space-y-3">
                <p className="text-xs text-[#9B7B52]">
                  Showing all food purchase entries recorded for <span className="font-bold text-[#2D1A0E]">{billingMonth} {billingYear}</span> ({monthFoodPurchases.length} entries):
                </p>
                <div className="overflow-x-auto border border-[#EFDCB4] rounded-xl">
                  <table className="data-table text-left text-xs">
                    <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold uppercase border-b border-[#EFDCB4]">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Item Name</th>
                        <th className="py-2.5 px-3">Quantity</th>
                        <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFDCB4]">
                      {monthFoodPurchases.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-[#9B7B52]">
                            No food purchases logged for {billingMonth} {billingYear}.
                          </td>
                        </tr>
                      ) : (
                        monthFoodPurchases.map((fp) => (
                          <tr key={fp.id} className="hover:bg-[#FDF7EA]">
                            <td className="py-2.5 px-3 font-mono text-[#5C3D1E]">{fp.date}</td>
                            <td className="py-2.5 px-3 font-bold text-[#2D1A0E]">{fp.item}</td>
                            <td className="py-2.5 px-3 font-mono text-[#9B7B52]">{fp.qty}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[#F47A35]">₹{fp.amount.toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {billingModal.type === 'GAS' && (
              <div className="space-y-3">
                <p className="text-xs text-[#9B7B52]">
                  Showing all gas and fuel operational expense records for <span className="font-bold text-[#2D1A0E]">{billingMonth} {billingYear}</span>:
                </p>
                <div className="overflow-x-auto border border-[#EFDCB4] rounded-xl">
                  <table className="data-table text-left text-xs">
                    <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold uppercase border-b border-[#EFDCB4]">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Title / Description</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFDCB4]">
                      {monthGasExpenses.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-[#9B7B52]">
                            No gas/fuel operational expenses logged for {billingMonth} {billingYear}.
                          </td>
                        </tr>
                      ) : (
                        monthGasExpenses.map((gp) => (
                          <tr key={gp.id} className="hover:bg-[#FDF7EA]">
                            <td className="py-2.5 px-3 font-mono text-[#5C3D1E]">{gp.date}</td>
                            <td className="py-2.5 px-3 font-bold text-[#2D1A0E]">{gp.title}</td>
                            <td className="py-2.5 px-3 text-[#F47A35] font-semibold">{gp.category}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2D1A0E]">₹{gp.amount.toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {billingModal.type === 'ADMIN' && (
              <div className="space-y-4">
                <p className="text-xs text-[#9B7B52]">
                  Administrative expenses breakdown for <span className="font-bold text-[#2D1A0E]">{billingMonth} {billingYear}</span>:
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-[#FDF7EA] rounded-xl border border-[#EFDCB4]">
                    <span className="text-[#9B7B52] block mb-1 font-bold">Workers Salary</span>
                    <span className="text-base font-extrabold text-[#2D1A0E]">₹{monthAdminRecord.salary.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-[#FDF7EA] rounded-xl border border-[#EFDCB4]">
                    <span className="text-[#9B7B52] block mb-1 font-bold">Committee Allowance</span>
                    <span className="text-base font-extrabold text-[#2D1A0E]">₹{monthAdminRecord.allowance.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-[#FDF7EA] rounded-xl border border-[#EFDCB4]">
                    <span className="text-[#9B7B52] block mb-1 font-bold">Stationary Charges</span>
                    <span className="text-base font-extrabold text-[#2D1A0E]">₹{monthAdminRecord.stationary.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-[#FDF7EA] rounded-xl border border-[#EFDCB4]">
                    <span className="text-[#9B7B52] block mb-1 font-bold">Misc Charges</span>
                    <span className="text-base font-extrabold text-[#2D1A0E]">₹{monthAdminRecord.misc.toLocaleString()}</span>
                  </div>
                </div>
                <div className="p-3.5 bg-[#F47A35]/10 border border-[#F47A35]/30 rounded-xl flex justify-between items-center text-xs font-bold text-[#F47A35]">
                  <span>Total Administrative Expenses</span>
                  <span className="text-sm font-black">₹{totalAdminExpenseAmount.toLocaleString()}</span>
                </div>
              </div>
            )}

            {billingModal.type === 'STOCK' && (() => {
              const isModalMonthPublished = !!isBillPublishedMap[`${billingMonth}-${billingYear}`];
              const searchLower = billingStockSearchPrefix.trim().toLowerCase();
              
              // Filter catalog items with prefix match first, then substring match
              let modalFilteredItems = inventoryCatalog;
              if (searchLower) {
                const prefixMatches = inventoryCatalog.filter(i => i.name.toLowerCase().startsWith(searchLower));
                modalFilteredItems = prefixMatches.length > 0
                  ? prefixMatches
                  : inventoryCatalog.filter(i => i.name.toLowerCase().includes(searchLower));
              }

              // Suggestion items list (up to 5 live suggestions)
              const suggestionsList = searchLower
                ? inventoryCatalog.filter(i => i.name.toLowerCase().includes(searchLower)).slice(0, 5)
                : [];

              const defaultOpMap: Record<string, number> = {
                'inv-cat-1': 100, 'inv-cat-2': 50, 'inv-cat-3': 40, 'inv-cat-4': 150,
                'inv-cat-5': 10, 'inv-cat-6': 20, 'inv-cat-7': 60, 'inv-cat-8': 30,
              };
              const defaultWacRates: Record<string, number> = {
                'inv-cat-1': 49, 'inv-cat-2': 42, 'inv-cat-3': 52, 'inv-cat-4': 6,
                'inv-cat-5': 190, 'inv-cat-6': 130, 'inv-cat-7': 30, 'inv-cat-8': 120,
              };

              return (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[#9B7B52]">
                      Inventory & Closing Stock Valuation breakdown for <span className="font-bold text-[#2D1A0E]">{billingMonth} {billingYear}</span>:
                    </p>
                    {isModalMonthPublished && (
                      <span className="px-2.5 py-0.5 bg-[#9B7B52]/10 text-[#6B4A28] border border-[#9B7B52]/30 font-extrabold text-[11px] rounded-full">
                        🔒 Read-Only (Bill Published)
                      </span>
                    )}
                  </div>

                  {/* Prefix Search Bar with Live Suggestions */}
                  <div className="space-y-2">
                    <label className="block text-xs font-extrabold text-[#2D1A0E]">
                      Search Stock Item Suggestions
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#BFA37A] text-[18px]">
                        search
                      </span>
                      <input
                        type="text"
                        value={billingStockSearchPrefix}
                        onChange={(e) => setBillingStockSearchPrefix(e.target.value)}
                        placeholder='Type prefix e.g. "B" for Beans/Butter, "Be" for Beef, "P" for Ponni Rice...'
                        className="w-full pl-9 pr-8 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-xs font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                      />
                      {billingStockSearchPrefix && (
                        <button
                          onClick={() => setBillingStockSearchPrefix('')}
                          className="absolute right-2.5 top-2 text-[#9B7B52] hover:text-[#2D1A0E]"
                        >
                          <span className="material-symbols-outlined text-[16px]">cancel</span>
                        </button>
                      )}
                    </div>

                    {/* Live Suggestion Pills */}
                    {suggestionsList.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#9B7B52]">Suggestions:</span>
                        {suggestionsList.map((sug) => (
                          <button
                            key={sug.id}
                            type="button"
                            onClick={() => setBillingStockSearchPrefix(sug.name)}
                            className="px-2.5 py-1 bg-[#F47A35]/10 hover:bg-[#F47A35] text-[#F47A35] hover:text-white border border-[#F47A35]/30 text-[11px] font-extrabold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <span>{sug.name}</span>
                            <span className="text-[9px] opacity-75">({sug.unit})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stock Valuation Table */}
                  <div className="overflow-x-auto border border-[#EFDCB4] rounded-xl max-h-56">
                    <table className="data-table text-left text-xs">
                      <thead className="bg-[#FDF7EA] text-[#6B4A28] font-extrabold uppercase border-b border-[#EFDCB4] sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3">Item Name</th>
                          <th className="py-2.5 px-3">Unit</th>
                          <th className="py-2.5 px-3 text-center">Physical Closing Qty</th>
                          <th className="py-2.5 px-3 text-right">Closing Valuation (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFDCB4]">
                        {modalFilteredItems.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-[#9B7B52] font-medium">
                              No stock items matching "{billingStockSearchPrefix}"
                            </td>
                          </tr>
                        ) : (
                          modalFilteredItems.map((item) => {
                            const stockKey = `${billingMonth}-${billingYear}-${item.id}`;
                            const defaultQty = defaultOpMap[item.id] ?? 20;
                            const physicalClosingQty = physicalClosingStockMap[stockKey] !== undefined
                              ? physicalClosingStockMap[stockKey]
                              : defaultQty;
                            const wacRate = defaultWacRates[item.id] ?? 50;
                            const itemClosingValue = physicalClosingQty * wacRate;

                            return (
                              <tr key={item.id} className="hover:bg-[#FDF7EA]">
                                <td className="py-2.5 px-3 font-bold text-[#2D1A0E]">{item.name}</td>
                                <td className="py-2.5 px-3 font-mono text-[#9B7B52]">{item.unit}</td>
                                <td className="py-2.5 px-3 text-center">
                                  {isModalMonthPublished ? (
                                    <span className="font-mono font-bold text-[#2D1A0E] bg-[#9B7B52]/10 px-2 py-0.5 rounded border border-[#9B7B52]/20">
                                      {physicalClosingQty} 🔒
                                    </span>
                                  ) : (
                                    <input
                                      type="number"
                                      value={physicalClosingQty}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value || '0');
                                        handleUpdatePhysicalClosingStock(item.id, val);
                                      }}
                                      className="w-20 px-2 py-1 bg-white border border-[#E3CB9B] rounded font-mono font-bold text-center text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                                    />
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-[#F47A35]">
                                  ₹{itemClosingValue.toLocaleString()}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Inputs Sync */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="p-3 bg-[#FDF7EA] rounded-xl border border-[#EFDCB4]">
                      <span className="text-[11px] font-extrabold uppercase text-[#9B7B52] block mb-1">Opening Stock Valuation</span>
                      <span className="text-base font-black text-[#2D1A0E] font-mono">₹{billingOpeningStock.toLocaleString()}</span>
                    </div>

                    <div className="p-3 bg-[#F47A35]/5 rounded-xl border border-[#F47A35]/20">
                      <span className="text-[11px] font-extrabold uppercase text-[#F47A35] block mb-1">Closing Stock Valuation</span>
                      <span className="text-base font-black text-[#F47A35] font-mono">₹{billingClosingStock.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setBillingModal({ ...billingModal, isOpen: false })}
                className="px-5 py-2 bg-[#2D1A0E] text-white font-bold text-xs rounded-xl hover:bg-[#3E2718] cursor-pointer"
              >
                Done / Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* DRILL-DOWN STUDENT DETAIL LIST MODAL                          */}
      {/* ------------------------------------------------------------- */}
      {drillDown.isOpen && (
        <div className="modal-scrim animate-fade-in">
          <div className="modal-panel max-w-3xl space-y-4">

            {/* Modal Header */}
            <div className="flex justify-between items-start gap-3 pb-4 border-b border-[#EFDCB4]">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: drillDown.colorHex }}>
                  {drillDown.mealTitle}
                </p>
                <h3 className="font-display text-[19px] sm:text-[21px] font-bold text-[#2D1A0E] leading-tight mt-0.5">
                  {drillDown.categoryLabel}
                  <span className="font-semibold text-[#9B7B52]"> · {filteredDrillDownStudents.length}</span>
                </h3>
                <p className="text-[11.5px] font-semibold text-[#9B7B52] mt-1">
                  Student breakdown for today&rsquo;s service
                </p>
              </div>

              <button
                onClick={() => setDrillDown((prev) => ({ ...prev, isOpen: false }))}
                className="w-9 h-9 shrink-0 rounded-full bg-[#F7EEDA] hover:bg-[#EFDCB4] text-[#9B7B52] flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* In-Modal Search Input */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#BFA37A] text-[20px]">
                search
              </span>
              <input
                type="text"
                value={drillDownSearch}
                onChange={(e) => setDrillDownSearch(e.target.value)}
                placeholder="Search student name, registration ID, department..."
                className="w-full pl-10 pr-4 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
              />
            </div>

            {/* Student Table / List Container */}
            <div className="flex-1 overflow-y-auto table-scroll min-h-[250px] border border-[#EFDCB4] rounded-xl">
              {drillDownLoading ? (
                <div className="p-12 text-center text-[#9B7B52] flex flex-col items-center justify-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-[32px] text-[#F47A35]">sync</span>
                  <p className="text-sm font-semibold">Loading student records...</p>
                </div>
              ) : filteredDrillDownStudents.length === 0 ? (
                <div className="p-12 text-center text-[#9B7B52] flex flex-col items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[36px] text-[#BFA37A]">person_off</span>
                  <p className="text-base font-bold text-[#5C3D1E]">No students found</p>
                  <p className="text-xs text-[#9B7B52]">No student records matching this status criteria.</p>
                </div>
              ) : (
                <table className="data-table text-left text-sm">
                  <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold text-xs uppercase border-b border-[#EFDCB4] sticky top-0">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Reg No</th>
                      <th className="py-3 px-4">Mess ID</th>
                      <th className="py-3 px-4">Department / Class</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFDCB4]">
                    {filteredDrillDownStudents.map((s, idx) => (
                      <tr key={s.id || idx} className="hover:bg-[#FDF7EA] transition-colors">
                        <td className="py-3 px-4 font-semibold text-[#2D1A0E] flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#F47A35]/10 text-[#F47A35] font-bold text-xs flex items-center justify-center">
                            {s.name?.charAt(0) || 'S'}
                          </div>
                          <span>{s.name}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-[#5C3D1E]">{s.registration_number}</td>
                        <td className="py-3 px-4 font-mono text-xs text-[#9B7B52]">{s.mess_id}</td>
                        <td className="py-3 px-4 text-xs text-[#6B4A28]">{s.department || 'Computer Science & Eng'}</td>
                        <td className="py-3 px-4 text-center">
                          <span
                            style={{
                              backgroundColor: `${drillDown.colorHex}15`,
                              color: drillDown.colorHex,
                              borderColor: `${drillDown.colorHex}30`,
                            }}
                            className="px-2.5 py-0.5 border text-xs font-extrabold rounded-full inline-block"
                          >
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 flex justify-between items-center">
              <span className="text-xs font-semibold text-[#9B7B52]">
                Showing {filteredDrillDownStudents.length} of {drillDownStudents.length} records
              </span>
              <button
                onClick={() => setDrillDown((prev) => ({ ...prev, isOpen: false }))}
                className="px-5 py-2 bg-[#2D1A0E] text-white font-semibold text-xs rounded-xl hover:bg-[#3E2718] cursor-pointer"
              >
                Done / Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MASTER STUDENT DETAILS MODAL ("BIG BOX")                      */}
      {/* ------------------------------------------------------------- */}
      {activeMasterStudent && (
        <div className="modal-scrim animate-fade-in">
          <div className="modal-panel max-w-2xl space-y-6 overflow-y-auto relative">
            
            {/* Close Button */}
            <button
              onClick={() => setActiveMasterStudent(null)}
              className="absolute top-5 right-5 w-9 h-9 rounded-full bg-[#F7EEDA] hover:bg-[#EFDCB4] text-[#9B7B52] hover:text-[#2D1A0E] flex items-center justify-center transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            {/* Header: Photo, Name, Mess ID, Reg No */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 pb-6 border-b border-[#EFDCB4]">
              <img
                src={activeMasterStudent.photo}
                alt={activeMasterStudent.name}
                className="w-20 h-20 rounded-full object-cover border-4 border-[#F47A35] shadow-md"
              />
              <div className="text-center sm:text-left space-y-1">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h3 className="text-2xl font-extrabold text-[#2D1A0E]">{activeMasterStudent.name}</h3>
                  <span className="px-2.5 py-0.5 bg-[#F47A35]/10 text-[#F47A35] border border-[#F47A35]/30 text-xs font-mono font-bold rounded-full">
                    {activeMasterStudent.messId}
                  </span>
                </div>
                <p className="text-xs text-[#9B7B52] font-medium">
                  Registration Number: <span className="font-bold text-[#2D1A0E]">{activeMasterStudent.regNo}</span>
                </p>
                
                {/* Upcoming Meal Status Badge */}
                <div className="pt-1">
                  {activeMasterStudent.upcomingMealStatus === 'OPTED_IN' && (
                    <span className="px-3 py-1 bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/30 text-xs font-extrabold rounded-full inline-flex items-center gap-1">
                      🟢 Opted In For Upcoming Meal
                    </span>
                  )}
                  {activeMasterStudent.upcomingMealStatus === 'SKIPPED' && (
                    <span className="px-3 py-1 bg-[#dc2626]/10 text-[#dc2626] border border-[#dc2626]/30 text-xs font-extrabold rounded-full inline-flex items-center gap-1">
                      🔴 Opted Out / Skipped
                    </span>
                  )}
                  {activeMasterStudent.upcomingMealStatus === 'PENDING' && (
                    <span className="px-3 py-1 bg-[#ea580c]/10 text-[#ea580c] border border-[#ea580c]/30 text-xs font-extrabold rounded-full inline-flex items-center gap-1">
                      🟠 Pending QR Scan
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Admin Editable Controls Box */}
            <div className="bg-[#FDF7EA] p-4 rounded-2xl border border-[#E3CB9B] space-y-3">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#F47A35] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">edit_note</span>
                Admin Editable Settings
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1">Dietary Preference</label>
                  <select
                    value={editDietaryPref}
                    onChange={(e) => setEditDietaryPref(e.target.value as 'Veg' | 'Non-Veg')}
                    className="w-full p-2.5 bg-white border border-[#E3CB9B] rounded-xl text-sm font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                  >
                    <option value="Veg">🥦 Vegetarian (Veg)</option>
                    <option value="Non-Veg">🍗 Non-Vegetarian (Non-Veg)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#6B4A28] mb-1">Hostel Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as 'Inmate' | 'Lakeside' | 'Outmess')}
                    className="w-full p-2.5 bg-white border border-[#E3CB9B] rounded-xl text-sm font-bold text-[#2D1A0E] focus:outline-none focus:border-[#F47A35]"
                  >
                    <option value="Inmate">🏠 Inmate (Main Hosteller)</option>
                    <option value="Lakeside">🌊 Lakeside Campus Hosteller</option>
                    <option value="Outmess">🚶 Outmess / Day Scholar</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSaveStudentChanges}
                  className="px-4 py-2 bg-[#F47A35] hover:bg-[#D45E1A] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  Save Preference & Category Changes
                </button>
              </div>
            </div>

            {/* Profile Information Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-white border border-[#EFDCB4] rounded-xl">
                <span className="text-[11px] font-bold text-[#9B7B52] uppercase tracking-wider block mb-1">Department</span>
                <p className="font-semibold text-xs text-[#2D1A0E]">{activeMasterStudent.department}</p>
              </div>

              <div className="p-3 bg-white border border-[#EFDCB4] rounded-xl">
                <span className="text-[11px] font-bold text-[#9B7B52] uppercase tracking-wider block mb-1">Mail ID</span>
                <p className="font-mono text-xs text-[#F47A35] truncate">{activeMasterStudent.email}</p>
              </div>

              <div className="p-3 bg-white border border-[#EFDCB4] rounded-xl">
                <span className="text-[11px] font-bold text-[#9B7B52] uppercase tracking-wider block mb-1">Room Number</span>
                <p className="font-semibold text-xs text-[#2D1A0E]">{activeMasterStudent.roomNo}</p>
              </div>
            </div>

            {/* Attendance & Fines Metrics (Standard Color Coded Cards) */}
            <div className="space-y-2">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#6B4A28]">
                Monthly Attendance & Fine Summary
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                {/* Green: Opted In Days */}
                <div className="p-4 bg-[#16a34a]/10 border border-[#16a34a]/30 rounded-2xl flex flex-col">
                  <div className="flex items-center gap-1.5 text-[#16a34a] text-xs font-bold">
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    <span>Days Opted In</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-black text-[#16a34a]">{activeMasterStudent.daysOptedIn}</span>
                    <span className="text-xs font-bold text-[#16a34a]">Days</span>
                  </div>
                  <span className="text-[10px] font-medium text-[#16a34a]/80 mt-1">Until today</span>
                </div>

                {/* Blue: Mess Cuts Count */}
                <div className="p-4 bg-[#F47A35]/10 border border-[#F47A35]/30 rounded-2xl flex flex-col">
                  <div className="flex items-center gap-1.5 text-[#F47A35] text-xs font-bold">
                    <span className="material-symbols-outlined text-[18px]">event_busy</span>
                    <span>Mess Cuts Taken</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-black text-[#F47A35]">{activeMasterStudent.messCutsTaken}</span>
                    <span className="text-xs font-bold text-[#F47A35]">/ 10 Days Max</span>
                  </div>
                  <span className="text-[10px] font-medium text-[#F47A35]/80 mt-1">Allowed per month</span>
                </div>

                {/* Red: Fines Received */}
                <div className="p-4 bg-[#dc2626]/10 border border-[#dc2626]/30 rounded-2xl flex flex-col">
                  <div className="flex items-center gap-1.5 text-[#dc2626] text-xs font-bold">
                    <span className="material-symbols-outlined text-[18px]">gavel</span>
                    <span>Fines Accrued</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-black text-[#dc2626]">₹{activeMasterStudent.finesReceived}</span>
                  </div>
                  <span className="text-[10px] font-medium text-[#dc2626]/80 mt-1">Total fine amount</span>
                </div>

              </div>
            </div>

            {/* Modal Footer Close */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setActiveMasterStudent(null)}
                className="px-6 py-2.5 bg-[#2D1A0E] hover:bg-[#3E2718] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Close Profile
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Edit Day Menu Modal */}
      {editingDayMenu && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <h3 className="text-xl font-extrabold text-[#2D1A0E]">Edit {editingDayMenu.day} Food Menu</h3>
            
            <div>
              <label className="block text-xs font-bold text-[#6B4A28] mb-1">Breakfast Menu</label>
              <input
                type="text"
                value={editingDayMenu.breakfast}
                onChange={(e) => setEditingDayMenu({ ...editingDayMenu, breakfast: e.target.value })}
                className="w-full p-2.5 border border-[#E3CB9B] rounded-xl text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#6B4A28] mb-1">Lunch Menu</label>
              <input
                type="text"
                value={editingDayMenu.lunch}
                onChange={(e) => setEditingDayMenu({ ...editingDayMenu, lunch: e.target.value })}
                className="w-full p-2.5 border border-[#E3CB9B] rounded-xl text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#6B4A28] mb-1">Dinner Menu</label>
              <input
                type="text"
                value={editingDayMenu.dinner}
                onChange={(e) => setEditingDayMenu({ ...editingDayMenu, dinner: e.target.value })}
                className="w-full p-2.5 border border-[#E3CB9B] rounded-xl text-sm font-medium"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveEditedMenu}
                className="flex-1 py-2.5 bg-[#F47A35] text-white font-bold rounded-xl hover:bg-[#D45E1A]"
              >
                Save Menu Changes
              </button>
              <button
                onClick={() => setEditingDayMenu(null)}
                className="px-4 py-2.5 border border-[#E3CB9B] text-[#6B4A28] font-bold rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Modals */}
      <CreateAdminModal
        isOpen={showCreateAdminModal}
        onClose={() => setShowCreateAdminModal(false)}
      />

      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-xl font-bold text-[#151c27]">Export Daily Overview</h3>
            <p className="text-sm text-[#434655]">Select report format:</p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  try {
                    await adminApi.downloadReportFile(2026, 8, 'excel');
                  } catch (e: any) {
                    alert(`Export failed: ${e.message}`);
                  }
                  setShowExportModal(false);
                }}
                className="flex-1 py-2.5 bg-[#F47A35] text-white font-semibold rounded-lg hover:bg-[#D45E1A] transition-colors"
              >
                Download Excel (.xlsx)
              </button>
              <button
                onClick={async () => {
                  try {
                    await adminApi.downloadReportFile(2026, 8, 'pdf');
                  } catch (e: any) {
                    alert(`Export failed: ${e.message}`);
                  }
                  setShowExportModal(false);
                }}
                className="flex-1 py-2.5 bg-[#16a34a] text-white font-semibold rounded-lg hover:bg-[#15803d] transition-colors"
              >
                Download PDF
              </button>
            </div>
            <button onClick={() => setShowExportModal(false)} className="w-full text-center text-sm text-[#737686]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showHolidayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-xl font-bold text-[#151c27]">Declare Mess Holiday</h3>
            <div>
              <label className="block text-xs font-semibold text-[#434655] mb-1">Select Date</label>
              <input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                className="w-full p-2 border border-[#c3c6d7] rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#434655] mb-1">Reason / Event Name</label>
              <input
                type="text"
                value={holidayReason}
                onChange={(e) => setHolidayReason(e.target.value)}
                placeholder="e.g. Onam Special / Mess Cleaning"
                className="w-full p-2 border border-[#c3c6d7] rounded-lg text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveHoliday}
                className="flex-1 py-2.5 bg-[#F47A35] text-white font-semibold rounded-lg hover:bg-[#D45E1A]"
              >
                Save Holiday Rule
              </button>
              <button
                onClick={() => setShowHolidayModal(false)}
                className="px-4 py-2.5 border border-[#c3c6d7] text-[#434655] font-semibold rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showManualModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-xl font-bold text-[#151c27]">Manual Attendance Entry</h3>
            <div>
              <label className="block text-xs font-semibold text-[#434655] mb-1">Registration No or Mess ID</label>
              <input
                type="text"
                value={manualStudentId}
                onChange={(e) => setManualStudentId(e.target.value)}
                placeholder="e.g. TEST001"
                className="w-full p-2 border border-[#c3c6d7] rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#434655] mb-1">Meal</label>
              <select
                value={manualMealType}
                onChange={(e) => setManualMealType(e.target.value)}
                className="w-full p-2 border border-[#c3c6d7] rounded-lg text-sm"
              >
                <option value="LUNCH">Lunch</option>
                <option value="BREAKFAST">Breakfast</option>
                <option value="DINNER">Dinner</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#434655] mb-1">Reason</label>
              <input
                type="text"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                className="w-full p-2 border border-[#c3c6d7] rounded-lg text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRecordManual}
                className="flex-1 py-2.5 bg-[#16a34a] text-white font-semibold rounded-lg hover:bg-[#15803d]"
              >
                Mark Present
              </button>
              <button
                onClick={() => setShowManualModal(false)}
                className="px-4 py-2.5 border border-[#c3c6d7] text-[#434655] font-semibold rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
