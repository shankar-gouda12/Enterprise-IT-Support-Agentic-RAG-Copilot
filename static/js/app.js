const chat = document.getElementById('chat');
const form = document.getElementById('chatForm');
const question = document.getElementById('question');
const trace = document.getElementById('trace');
const sourceUsed = document.getElementById('sourceUsed');

function escapeHtml(s=''){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

function formatInline(s) {
  if (!s) return '';
  return s
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function renderMarkdownFallback(text) {
  if (!text) return '';
  let s = text.replace(/【[^】]*】/g, '');
  
  // Format tables
  s = s.replace(/((?:\|[^\n]+\|\r?\n?)+)/g, function(match) {
    const lines = match.trim().split(/\r?\n/).filter(l => l.includes('|'));
    if (lines.length < 2) return match;
    let table = '<table>';
    let isHeader = true;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^\|[-:\s|]+\|$/.test(line)) {
        isHeader = false;
        continue;
      }
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      const tag = isHeader ? 'th' : 'td';
      table += '<tr>' + cells.map(c => `<${tag}>${formatInline(c)}</${tag}>`).join('') + '</tr>';
    }
    table += '</table>';
    return table;
  });

  const lines = s.split(/\r?\n/);
  let out = [];
  let inList = false;

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) { out.push('</ul>'); inList = false; }
      continue;
    }
    if (/^###\s+(.*)/.test(trimmed)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${formatInline(trimmed.replace(/^###\s+/, ''))}</h3>`);
    } else if (/^##\s+(.*)/.test(trimmed)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2>${formatInline(trimmed.replace(/^##\s+/, ''))}</h2>`);
    } else if (/^#\s+(.*)/.test(trimmed)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h1>${formatInline(trimmed.replace(/^#\s+/, ''))}</h1>`);
    } else if (/^>\s+(.*)/.test(trimmed)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<blockquote>${formatInline(trimmed.replace(/^>\s+/, ''))}</blockquote>`);
    } else if (/^[-*]\s+(.*)/.test(trimmed) || /^\d+\.\s+(.*)/.test(trimmed)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      const content = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
      out.push(`<li>${formatInline(content)}</li>`);
    } else if (trimmed.startsWith('<table') || trimmed.startsWith('<pre')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(trimmed);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${formatInline(trimmed)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

function formatText(s=''){
  if (!s) return '';
  // Strip messy bracketed citations
  s = s.replace(/【[^】]*】/g, '');
  if (typeof marked !== 'undefined') {
    try {
      if (typeof marked.parse === 'function') {
        return marked.parse(s, { breaks: true, gfm: true });
      }
      if (typeof marked === 'function') {
        return marked(s);
      }
    } catch (e) {
      console.warn('marked.parse error, falling back:', e);
    }
  }
  return renderMarkdownFallback(s);
}
function addMessage(role, text, source='', citations=[]){
  const wrap=document.createElement('div'); wrap.className=`message ${role}`;
  const citeHtml=citations.length?`<div class="citations"><strong>Sources</strong><br>${citations.map(c=>c.url?`<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.title)}</a>`:escapeHtml(c.title)).join('<br>')}</div>`:'';
  const sourceHtml=source?`<div class="answer-source-wrap"><span class="answer-source">Source: ${escapeHtml(source)}</span></div>`:'';
  wrap.innerHTML=`<div class="avatar">${role==='user'?'YOU':'AI'}</div><div class="bubble"><div class="bubble-content">${formatText(text)}</div>${sourceHtml}${citeHtml}</div>`;
  chat.appendChild(wrap); chat.scrollTop=chat.scrollHeight;
}
function renderTrace(items=[]){trace.innerHTML=items.length?items.map(x=>`<div class="trace-item">${escapeHtml(x)}</div>`).join(''):'<div class="empty">No trace.</div>';}
async function askAgent(q){
  addMessage('user',q); question.value=''; renderTrace(['Running LangGraph workflow...']); sourceUsed.textContent='Running';
  const btn=form.querySelector('button'); btn.disabled=true;
  try{
    const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q})});
    const data=await res.json(); if(!res.ok) throw new Error(data.detail||'Request failed');
    addMessage('assistant',data.answer,data.source_used,data.citations||[]); renderTrace(data.trace||[]); sourceUsed.textContent=data.source_used;
  }catch(e){addMessage('assistant',`Error: ${e.message}`); renderTrace(['Request failed']); sourceUsed.textContent='Error';}
  finally{btn.disabled=false;}
}
form.addEventListener('submit',e=>{e.preventDefault(); const q=question.value.trim(); if(q) askAgent(q);});
document.querySelectorAll('.example').forEach(b=>b.addEventListener('click',()=>askAgent(b.textContent.trim())));

const modal=document.getElementById('uploadModal');
document.getElementById('openUpload').onclick=()=>modal.classList.remove('hidden');
document.getElementById('closeUpload').onclick=()=>modal.classList.add('hidden');
document.getElementById('uploadBtn').onclick=async()=>{
  const file=document.getElementById('fileInput').files[0]; const key=document.getElementById('adminKey').value; const status=document.getElementById('uploadStatus');
  if(!file){status.textContent='Choose a file first.'; return;}
  status.textContent='Indexing document...'; const fd=new FormData(); fd.append('file',file);
  try{const r=await fetch('/api/ingest',{method:'POST',headers:{'X-Admin-Key':key},body:fd}); const d=await r.json(); if(!r.ok) throw new Error(d.detail||'Upload failed'); status.textContent=`Indexed ${d.file}: ${d.chunks} chunks.`;}catch(e){status.textContent=`Error: ${e.message}`;}
};
