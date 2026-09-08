import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { adminApi, menuApi } from '../services/api';

type Panel = 'menu' | 'ledger' | 'inventory' | 'committee' | 'attendance' | 'payments';
const panels: {id: Panel; label: string; icon: string}[] = [
  {id:'menu',label:'Menu',icon:'restaurant_menu'}, {id:'ledger',label:'Ledger',icon:'account_balance_wallet'},
  {id:'inventory',label:'Inventory',icon:'inventory_2'}, {id:'committee',label:'Committee',icon:'badge'},
  {id:'attendance',label:'Bulk attendance',icon:'fact_check'}, {id:'payments',label:'Payments',icon:'payments'},
];
const today = () => new Date().toISOString().slice(0, 10);

export const AdminOperationsView: React.FC = () => {
  const [panel, setPanel] = useState<Panel>('menu');
  const [data, setData] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ok:boolean;text:string}|null>(null);
  const [menuForm, setMenuForm] = useState({date:today(),meal_type:'BREAKFAST',items:'',notes:''});
  const [ledgerForm, setLedgerForm] = useState({entry_date:today(),kind:'PURCHASE',category:'Groceries',description:'',amount:'',vendor:'',reference:''});
  const [stockForm, setStockForm] = useState({sku:'',name:'',unit:'kg',opening_quantity:'0',reorder_level:'0',unit_cost:'0'});
  const [adjustForm, setAdjustForm] = useState({item_id:'',quantity_delta:'',reason:'',reference:''});
  const [committeeForm, setCommitteeForm] = useState({student_id:'',starts_at:'',ends_at:''});
  const [bulkForm, setBulkForm] = useState({student_ids:[] as string[],meal_date:today(),meal_type:'BREAKFAST',reason:''});
  const [voidReason, setVoidReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    try {
      if (panel === 'menu') setData(await menuApi.list(menuForm.date, menuForm.date));
      if (panel === 'ledger') setData(await adminApi.getLedger());
      if (panel === 'inventory') setData(await adminApi.getInventory());
      if (panel === 'committee') { setData(await adminApi.getCommittee()); setStudents(await adminApi.getStudentOptions()); }
      if (panel === 'attendance') setStudents(await adminApi.getStudentOptions());
      if (panel === 'payments') setData(await adminApi.getPayments());
    } catch (e:any) { setMessage({ok:false,text:e.message}); }
    finally { setLoading(false); }
  }, [panel, menuForm.date]);
  useEffect(() => { load(); }, [load]);

  const run = async (action: () => Promise<any>, success: string) => {
    setSaving(true); setMessage(null);
    try { await action(); setMessage({ok:true,text:success}); await load(); }
    catch (e:any) { setMessage({ok:false,text:e.message}); }
    finally { setSaving(false); }
  };
  const submitMenu = (e:FormEvent) => { e.preventDefault(); run(() => adminApi.publishMenu(menuForm.date, menuForm.meal_type,
    menuForm.items.split(',').map(x=>x.trim()).filter(Boolean), menuForm.notes || undefined), 'Menu published.'); };
  const submitLedger = (e:FormEvent) => { e.preventDefault(); run(() => adminApi.createLedger({...ledgerForm, amount:Number(ledgerForm.amount), vendor:ledgerForm.vendor||null, reference:ledgerForm.reference||null}), 'Ledger entry saved.'); };
  const submitStock = (e:FormEvent) => { e.preventDefault(); run(() => adminApi.createInventory({...stockForm, opening_quantity:Number(stockForm.opening_quantity),reorder_level:Number(stockForm.reorder_level),unit_cost:Number(stockForm.unit_cost)}), 'Inventory item created.'); };
  const adjustStock = (e:FormEvent) => { e.preventDefault(); run(() => adminApi.adjustInventory(adjustForm.item_id,{quantity_delta:Number(adjustForm.quantity_delta),reason:adjustForm.reason,reference:adjustForm.reference||null}), 'Stock balance updated.'); };
  const assignCommittee = (e:FormEvent) => { e.preventDefault(); run(() => adminApi.assignCommittee({...committeeForm, starts_at:new Date(committeeForm.starts_at).toISOString(), ends_at:new Date(committeeForm.ends_at).toISOString(),scope:'ATTENDANCE_SCANNER'}), 'Committee scanner access assigned.'); };
  const submitBulk = (e:FormEvent) => { e.preventDefault(); run(() => adminApi.bulkAttendance(bulkForm), `${bulkForm.student_ids.length} attendance records saved.`); };

  return <main className="page-container">
    <div className="mb-5"><h2 className="font-display text-[22px] font-bold" style={{color:'var(--text-dark)'}}>Mess operations</h2>
      <p className="text-sm font-semibold mt-1" style={{color:'var(--text-muted)'}}>Database-backed menu, finance, stock, access, attendance, and payment workflows.</p></div>
    <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
      {panels.map(p=><button key={p.id} className={panel===p.id?'btn-primary':'btn-secondary'} onClick={()=>setPanel(p.id)}>
        <span className="material-symbols-outlined" style={{fontSize:17}}>{p.icon}</span>{p.label}</button>)}
    </div>
    {message && <div role="alert" className="rounded-xl p-3 mb-4 text-sm font-bold" style={{background:message.ok?'#EAF8F0':'#FDECEA',color:message.ok?'#087443':'var(--red)',border:`1px solid ${message.ok?'#BCE5CE':'#F6C8C3'}`}}>{message.text}</div>}
    {loading ? <p role="status" className="p-8 text-center">Loading…</p> : <>
      {panel==='menu' && <section className="grid lg:grid-cols-2 gap-4">
        <Card title="Publish a meal menu"><form className="space-y-3" onSubmit={submitMenu}>
          <Field label="Date"><input className="stitch-input" type="date" required value={menuForm.date} onChange={e=>setMenuForm({...menuForm,date:e.target.value})}/></Field>
          <Field label="Meal"><select className="stitch-input" value={menuForm.meal_type} onChange={e=>setMenuForm({...menuForm,meal_type:e.target.value})}>{['BREAKFAST','LUNCH','DINNER'].map(x=><option key={x}>{x}</option>)}</select></Field>
          <Field label="Items (comma separated)"><textarea className="stitch-input" required maxLength={1000} value={menuForm.items} onChange={e=>setMenuForm({...menuForm,items:e.target.value})}/></Field>
          <Field label="Notes"><input className="stitch-input" maxLength={500} value={menuForm.notes} onChange={e=>setMenuForm({...menuForm,notes:e.target.value})}/></Field>
          <Submit busy={saving}>Publish menu</Submit></form></Card>
        <Card title={`Published menu for ${menuForm.date}`}><Rows empty="No menu is published for this date.">{(data||[]).map((x:any)=><Row key={x.id} title={x.meal_type} detail={x.items.join(', ')} meta={x.notes}/>)}</Rows></Card>
      </section>}
      {panel==='ledger' && <section className="grid lg:grid-cols-[360px_1fr] gap-4"><Card title="New ledger entry"><form className="space-y-3" onSubmit={submitLedger}>
        <Field label="Date"><input className="stitch-input" type="date" required value={ledgerForm.entry_date} onChange={e=>setLedgerForm({...ledgerForm,entry_date:e.target.value})}/></Field>
        <Field label="Type"><select className="stitch-input" value={ledgerForm.kind} onChange={e=>setLedgerForm({...ledgerForm,kind:e.target.value})}>{['PURCHASE','OPERATIONAL','ADMINISTRATIVE'].map(x=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Category"><input className="stitch-input" required maxLength={80} value={ledgerForm.category} onChange={e=>setLedgerForm({...ledgerForm,category:e.target.value})}/></Field>
        <Field label="Description"><textarea className="stitch-input" required maxLength={500} value={ledgerForm.description} onChange={e=>setLedgerForm({...ledgerForm,description:e.target.value})}/></Field>
        <Field label="Amount"><input className="stitch-input" type="number" min="0.01" step="0.01" required value={ledgerForm.amount} onChange={e=>setLedgerForm({...ledgerForm,amount:e.target.value})}/></Field>
        <Field label="Vendor / reference"><div className="grid grid-cols-2 gap-2"><input className="stitch-input" placeholder="Vendor" value={ledgerForm.vendor} onChange={e=>setLedgerForm({...ledgerForm,vendor:e.target.value})}/><input className="stitch-input" placeholder="Invoice" value={ledgerForm.reference} onChange={e=>setLedgerForm({...ledgerForm,reference:e.target.value})}/></div></Field>
        <Submit busy={saving}>Save entry</Submit></form></Card>
        <Card title="Active ledger"><div className="grid sm:grid-cols-3 gap-2 mb-4">{Object.entries(data?.totals||{}).map(([k,v])=><div key={k} className="rounded-xl p-3" style={{background:'var(--bg)'}}><p className="text-xs font-bold">{k}</p><p className="text-lg font-black">₹{Number(v).toLocaleString('en-IN')}</p></div>)}</div>
          <Field label="Reason required before voiding an entry"><input className="stitch-input mb-3" minLength={5} maxLength={500} value={voidReason} onChange={e=>setVoidReason(e.target.value)} placeholder="Explain the correction"/></Field>
          <Rows empty="No ledger entries.">{(data?.entries||[]).map((x:any)=><Row key={x.id} title={`${x.category} · ₹${Number(x.amount).toLocaleString('en-IN')}`} detail={x.description} meta={`${x.entry_date} · ${x.kind}`} action={<button disabled={voidReason.trim().length<5} className="text-xs font-bold disabled:opacity-40" style={{color:'var(--red)'}} onClick={()=>run(async()=>{await adminApi.voidLedger(x.id,voidReason);setVoidReason('');},'Entry voided with audit history.')}>Void</button>}/>)}</Rows></Card></section>}
      {panel==='inventory' && <section className="grid lg:grid-cols-[360px_1fr] gap-4"><div className="space-y-4"><Card title="Add catalogue item"><form className="space-y-3" onSubmit={submitStock}>
        {(['sku','name','unit'] as const).map(k=><Field key={k} label={k.toUpperCase()}><input className="stitch-input" required value={stockForm[k]} onChange={e=>setStockForm({...stockForm,[k]:e.target.value})}/></Field>)}
        {(['opening_quantity','reorder_level','unit_cost'] as const).map(k=><Field key={k} label={k.replaceAll('_',' ')}><input className="stitch-input" type="number" min="0" step="0.001" required value={stockForm[k]} onChange={e=>setStockForm({...stockForm,[k]:e.target.value})}/></Field>)}<Submit busy={saving}>Create item</Submit></form></Card>
        <Card title="Record stock movement"><form className="space-y-3" onSubmit={adjustStock}><Field label="Item"><select className="stitch-input" required value={adjustForm.item_id} onChange={e=>setAdjustForm({...adjustForm,item_id:e.target.value})}><option value="">Choose item</option>{(data||[]).map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field><Field label="Quantity change (+ received, - used)"><input className="stitch-input" type="number" step="0.001" required value={adjustForm.quantity_delta} onChange={e=>setAdjustForm({...adjustForm,quantity_delta:e.target.value})}/></Field><Field label="Reason"><input className="stitch-input" required value={adjustForm.reason} onChange={e=>setAdjustForm({...adjustForm,reason:e.target.value})}/></Field><Submit busy={saving}>Update balance</Submit></form></Card></div>
        <Card title="Inventory catalogue"><Rows empty="No inventory items.">{(data||[]).map((x:any)=><Row key={x.id} title={`${x.name} · ${x.quantity} ${x.unit}`} detail={`SKU ${x.sku} · ₹${x.unit_cost}/${x.unit}`} meta={x.low_stock?'Low stock':'Stock level OK'} danger={x.low_stock}/>)}</Rows></Card></section>}
      {panel==='committee' && <section className="grid lg:grid-cols-[400px_1fr] gap-4"><Card title="Assign scanner access"><form className="space-y-3" onSubmit={assignCommittee}><Field label="Student"><select className="stitch-input" required value={committeeForm.student_id} onChange={e=>setCommitteeForm({...committeeForm,student_id:e.target.value})}><option value="">Choose student</option>{students.map(x=><option key={x.id} value={x.id}>{x.name} ({x.registration_number})</option>)}</select></Field><Field label="Starts"><input className="stitch-input" type="datetime-local" required value={committeeForm.starts_at} onChange={e=>setCommitteeForm({...committeeForm,starts_at:e.target.value})}/></Field><Field label="Ends"><input className="stitch-input" type="datetime-local" required value={committeeForm.ends_at} onChange={e=>setCommitteeForm({...committeeForm,ends_at:e.target.value})}/></Field><Submit busy={saving}>Assign access</Submit></form></Card>
        <Card title="Active committee"><Rows empty="No active assignments.">{(data||[]).map((x:any)=><Row key={x.id} title={x.name} detail={x.registration_number} meta={`Until ${new Date(x.ends_at).toLocaleString('en-IN')}`} action={<button className="text-xs font-bold" style={{color:'var(--red)'}} onClick={()=>run(()=>adminApi.revokeCommittee(x.student_id,'Committee assignment ended by administrator'),'Access revoked.')}>Revoke</button>}/>)}</Rows></Card></section>}
      {panel==='attendance' && <section className="max-w-2xl"><Card title="Atomic bulk attendance"><p className="text-xs mb-3" style={{color:'var(--text-muted)'}}>Choose up to 300 active students. The whole batch is rejected if any selected record already exists.</p><form className="space-y-3" onSubmit={submitBulk}><Field label="Date and meal"><div className="grid grid-cols-2 gap-2"><input className="stitch-input" type="date" max={today()} required value={bulkForm.meal_date} onChange={e=>setBulkForm({...bulkForm,meal_date:e.target.value})}/><select className="stitch-input" value={bulkForm.meal_type} onChange={e=>setBulkForm({...bulkForm,meal_type:e.target.value})}>{['BREAKFAST','LUNCH','DINNER'].map(x=><option key={x}>{x}</option>)}</select></div></Field><Field label="Students"><div className="max-h-64 overflow-auto rounded-xl border p-2" style={{borderColor:'var(--line)'}}>{students.map(x=><label key={x.id} className="flex gap-2 p-2 text-sm"><input type="checkbox" checked={bulkForm.student_ids.includes(x.id)} onChange={e=>setBulkForm({...bulkForm,student_ids:e.target.checked?[...bulkForm.student_ids,x.id]:bulkForm.student_ids.filter(id=>id!==x.id)})}/><span>{x.name} <small>{x.registration_number}</small></span></label>)}</div></Field><Field label="Reason"><input className="stitch-input" required minLength={5} value={bulkForm.reason} onChange={e=>setBulkForm({...bulkForm,reason:e.target.value})}/></Field><Submit busy={saving||!bulkForm.student_ids.length}>Save {bulkForm.student_ids.length} records</Submit></form></Card></section>}
      {panel==='payments' && <Card title="Payment verification queue"><Rows empty="No payment submissions.">{(data||[]).map((x:any)=><Row key={x.id} title={`${x.student_name} · ₹${Number(x.amount).toLocaleString('en-IN')}`} detail={`${x.registration_number} · UTR ${x.utr}`} meta={`${x.month}/${x.year} · ${x.status}`} action={x.status==='PENDING'?<div className="flex gap-2"><button className="text-xs font-bold text-green-700" onClick={()=>run(()=>adminApi.reviewPayment(x.id,'VERIFIED','UTR and bank credit verified'),'Payment verified.')}>Verify</button><button className="text-xs font-bold" style={{color:'var(--red)'}} onClick={()=>run(()=>adminApi.reviewPayment(x.id,'REJECTED','UTR could not be matched with bank credit'),'Payment rejected.')}>Reject</button></div>:undefined}/>)}</Rows></Card>}
    </>}
  </main>;
};

const Card:React.FC<{title:string;children:React.ReactNode}>=({title,children})=><div className="rounded-2xl p-4" style={{background:'var(--card)',border:'1px solid var(--line)'}}><h3 className="font-display text-base font-bold mb-4" style={{color:'var(--text-dark)'}}>{title}</h3>{children}</div>;
const Field:React.FC<{label:string;children:React.ReactNode}>=({label,children})=><label className="block text-xs font-bold" style={{color:'var(--text-body)'}}><span className="block mb-1">{label}</span>{children}</label>;
const Submit:React.FC<{busy:boolean;children:React.ReactNode}>=({busy,children})=><button className="btn-primary w-full justify-center" type="submit" disabled={busy}>{busy?'Saving…':children}</button>;
const Rows:React.FC<{empty:string;children:React.ReactNode}>=({empty,children})=><div className="divide-y" style={{borderColor:'var(--line)'}}>{React.Children.count(children)?children:<p className="py-8 text-center text-sm" style={{color:'var(--text-muted)'}}>{empty}</p>}</div>;
const Row:React.FC<{title:string;detail:string;meta?:string;action?:React.ReactNode;danger?:boolean}>=({title,detail,meta,action,danger})=><div className="py-3 flex items-start justify-between gap-3"><div><p className="text-sm font-bold" style={{color:danger?'var(--red)':'var(--text-dark)'}}>{title}</p><p className="text-xs mt-1" style={{color:'var(--text-body)'}}>{detail}</p>{meta&&<p className="text-[11px] mt-1" style={{color:'var(--text-muted)'}}>{meta}</p>}</div>{action}</div>;
