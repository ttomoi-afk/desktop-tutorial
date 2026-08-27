// Apps Script の最小モック（ロジック検証用）
const DOW = ['日','月','火','水','木','金','土'];
const pad = (n,w=2)=>String(n).padStart(w,'0');
global.Utilities = {
  formatDate(d, tz, fmt) {
    return fmt
      .replace(/yyyy/g, d.getFullYear())
      .replace(/yy(?!yy)/g, pad(d.getFullYear()%100))
      .replace(/MM/g, pad(d.getMonth()+1))
      .replace(/dd/g, pad(d.getDate()))
      .replace(/HH/g, pad(d.getHours()))
      .replace(/mm/g, pad(d.getMinutes()))
      .replace(/ss/g, pad(d.getSeconds()))
      .replace(/\(E\)/g, '('+DOW[d.getDay()]+')')
      .replace(/年M月/g, '年'+(d.getMonth()+1)+'月')
      .replace(/M月/g, (d.getMonth()+1)+'月')
      .replace(/d日/g, d.getDate()+'日');
  },
  getUuid: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
};
const STORE = {};
global.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => (k in STORE ? STORE[k] : null),
  setProperty: (k,v) => { STORE[k]=v; }
})};
const CACHE = {};
global.CacheService = { getScriptCache: () => ({
  get: k => (k in CACHE ? CACHE[k] : null),
  put: (k,v) => { CACHE[k]=v; },
  remove: k => { delete CACHE[k]; }
})};
global.console = console;

// --- Sheet mock ---
class Range {
  constructor(sh,r,c,nr,nc){ Object.assign(this,{sh,r,c,nr:nr||1,nc:nc||1}); }
  _read(fn){ const out=[]; for(let i=0;i<this.nr;i++){ const row=[];
    for(let j=0;j<this.nc;j++){ row.push(fn(this.sh.cell(this.r+i,this.c+j))); } out.push(row);} return out; }
  getValues(){ return this._read(v=>v===undefined?'':v); }
  getDisplayValues(){ return this._read(v=> v===undefined||v===null ? '' :
    (v instanceof Date ? Utilities.formatDate(v,'','yyyy/MM/dd') : String(v))); }
  getValue(){ return this.getValues()[0][0]; }
  getDisplayValue(){ return this.getDisplayValues()[0][0]; }
  setValue(v){ this.sh.set(this.r,this.c,v); return this; }
  setValues(vals){ vals.forEach((row,i)=>row.forEach((v,j)=>this.sh.set(this.r+i,this.c+j,v))); return this; }
  setNumberFormat(){ return this; } setFontWeight(){ return this; } setBackground(){ return this; }
  isPartOfMerge(){ for(let i=0;i<this.nr;i++) for(let j=0;j<this.nc;j++)
      if(this.sh.merges.some(m=>this.r+i>=m.r&&this.r+i<m.r+m.nr&&this.c+j>=m.c&&this.c+j<m.c+m.nc)) return true;
    return false; }
}
class Sheet {
  constructor(name,grid,merges){ this.name=name; this.data={}; this.merges=merges||[];
    this.maxRows=Math.max(grid.length,20); this.maxCols=12;
    grid.forEach((row,i)=>row.forEach((v,j)=>{ if(v!=='' && v!=null) this.set(i+1,j+1,v); })); }
  key(r,c){ return r+','+c; }
  cell(r,c){ return this.data[this.key(r,c)]; }
  set(r,c,v){ this.data[this.key(r,c)] = v; this.maxRows=Math.max(this.maxRows,r); this.maxCols=Math.max(this.maxCols,c); }
  getName(){ return this.name; } setName(n){ this.name=n; return this; }
  getMaxRows(){ return this.maxRows; } getMaxColumns(){ return this.maxCols; }
  getLastRow(){ let m=0; for(const k in this.data){ const r=+k.split(',')[0];
    if(this.data[k]!=='' && this.data[k]!=null) m=Math.max(m,r);} return m; }
  getRange(r,c,nr,nc){ return new Range(this,r,c,nr,nc); }
  insertRowsAfter(after,n){ this.maxRows=Math.max(this.maxRows, after+n); }
  appendRow(vals){ const r=this.getLastRow()+1; vals.forEach((v,j)=>this.set(r,j+1,v)); }
  setFrozenRows(){} setColumnWidth(){}
  copyTo(){ const c=new Sheet(this.name+' のコピー',[]);
    c.data=Object.assign({},this.data); c.maxRows=this.maxRows; c.maxCols=this.maxCols;
    c.merges=this.merges.slice(); global.__SHEETS.push(c); return c; }
}
global.__mkSheet = (name,grid,merges)=>new Sheet(name,grid,merges);
global.__setSS = sheets => { global.__SHEETS = sheets; global.SpreadsheetApp = { getActive: () => ({
  getSheetByName: n => sheets.find(s=>s.getName()===n) || null,
  getSheets: () => sheets,
  insertSheet: (n)=>{ const s=new Sheet(n,[]); sheets.push(s); return s; },
  setActiveSheet(){}, moveActiveSheet(){}, getNumSheets:()=>sheets.length
}), openById(){ return this.getActive(); }, getUi(){ throw new Error('no ui'); } }; };
