import { useEffect,useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Notice } from './UI.jsx'

const textError = err => err.message || 'The request could not be completed.'
export async function encodeFile(file) {
  if(file.size>2097152) throw new Error('Choose a file under 2 MB.')
  const data = await new Promise((ok,fail)=>{const reader=new FileReader();reader.onload=()=>ok(reader.result);reader.onerror=()=>fail(new Error('Cannot read file.'));reader.readAsDataURL(file)})
  return data.split(',')[1]
}

function saveDownload({encoded,mime}, label) {
  const url=URL.createObjectURL(new Blob([Uint8Array.from(atob(encoded),ch=>ch.charCodeAt(0))],{type:mime}))
  const a=document.createElement('a');a.href=url;a.download=label+'.'+({'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'}[mime]);a.click()
  setTimeout(()=>URL.revokeObjectURL(url),2000)
}

export function CaseAttachment({reference,token,caseId}) {
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  async function handle(file) {
    setBusy(true);setError('');setNotice('')
    try {
      if(caseId) {
        const {data,error}=await supabase.rpc('read_case_attachment',{p_case:caseId})
        if(error) throw error
        if(data?.[0]) saveDownload(data[0],reference)
        else setNotice('No file attached.')
      } else if(file) {
        const {error}=await supabase.rpc('submit_case_attachment',{p_reference:reference,p_token:token,p_type:file.type,p_content:await encodeFile(file)})
        if(error) throw error
        setNotice('Supporting file saved.')
      }
    } catch(err){setError(textError(err))}
    finally{setBusy(false)}
  }
  return (
    <div className="compact-attachment-item">
      {caseId ? (
        <button type="button" className="button button-ghost button-small" disabled={busy} onClick={()=>handle()}>
          Check Supporting File
        </button>
      ) : (
        <label className="compact-upload-label">
          Supporting file (optional, PDF or image up to 2 MB)
          <input type="file" disabled={busy} accept="application/pdf,image/jpeg,image/png" onChange={e=>handle(e.target.files[0])}/>
        </label>
      )}
      <Notice type="error">{error}</Notice>
      <Notice type="success">{notice}</Notice>
    </div>
  )
}

export default function RequestDocuments({ applicationId, reference, token, closed }) {
  const staff = Boolean(applicationId)
  const { user } = useAuth()
  const [items,setItems] = useState([])
  const [error,setError] = useState('')
  const [revision,reload] = useState(0)
  const [busy,setBusy] = useState(false)
  useEffect(()=>{
    let active=true
    const query = staff ? supabase.from('application_requirements').select('requirement_id:id,label:requirement_name,state:status').eq('application_id',applicationId).order('created_at')
      : supabase.rpc('request_checklist',{p_reference:reference,p_token:token})
    query.then(({data,error})=>{if(active){setItems(data || []);setError(error ? textError(error) : '')}})
    return ()=>{active=false}
  },[applicationId,staff,reference,token,revision])
  async function action(run) {
    setBusy(true);setError('')
    try { const res=await run(); if(res?.error) throw res.error; reload(v=>v+1) }
    catch(err){setError(textError(err))}
    finally{setBusy(false)}
  }
  async function upload(item,file) {
    if (!file) return
    const content = await encodeFile(file)
    return supabase.rpc('submit_requested_file',{p_reference:reference,p_token:token,p_requirement:item.requirement_id,p_content:content,p_type:file.type})
  }
  async function download(item) {
    const {data,error}=await supabase.rpc('read_requested_file',{p_requirement:item.requirement_id})
    if(error) throw error
    if(!data?.[0]) throw new Error('No online file for this item.')
    saveDownload(data[0],item.label)
  }
  if(!staff && !items.length && !error) return null
  return (
    <section className="checklist request-checklist compact-checklist">
      <div className="compact-checklist-heading">
        <strong>Requested Documents {items.length ? `(${items.length})` : ''}</strong>
      </div>
      <Notice type="error">{error}</Notice>

      {items.length > 0 && (
        <div className="compact-doc-list">
          {items.map((item) => (
            <div className="compact-doc-item" key={item.requirement_id}>
              <span className="compact-doc-name">{item.label}</span>
              <span className={`compact-doc-status status-${item.state}`}>{item.state}</span>
              {!staff && !closed && ['requested','rejected'].includes(item.state) && (
                <label className="compact-upload-label">
                  Upload file
                  <input
                    disabled={busy}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    onChange={(e) => {
                      const file = e.target.files[0]
                      if (file) action(() => upload(item, file))
                    }}
                  />
                </label>
              )}
              {staff && item.state === 'submitted' && (
                <button
                  disabled={busy}
                  onClick={() => action(() => download(item))}
                  type="button"
                  className="button button-ghost button-xs"
                >
                  Download
                </button>
              )}
              {staff && !closed && ['submitted','requested','rejected'].includes(item.state) && (
                <div className="compact-doc-actions">
                  <button
                    type="button"
                    disabled={busy}
                    className="button button-success-ghost button-xs"
                    onClick={() =>
                      action(() =>
                        supabase
                          .from('application_requirements')
                          .update({
                            status: 'accepted',
                            reviewed_by: user.id,
                            reviewed_at: new Date().toISOString(),
                          })
                          .eq('id', item.requirement_id)
                          .eq('status', item.state)
                          .select('id')
                          .single()
                      )
                    }
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="button button-ghost button-xs"
                    onClick={() =>
                      action(() =>
                        supabase
                          .from('application_requirements')
                          .update({
                            status: 'rejected',
                            reviewed_by: user.id,
                            reviewed_at: new Date().toISOString(),
                          })
                          .eq('id', item.requirement_id)
                          .eq('status', item.state)
                          .select('id')
                          .single()
                      )
                    }
                  >
                    Replace
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {staff && !closed && (
        <form
          className="compact-add-doc-form"
          onSubmit={(e) => {
            e.preventDefault()
            const form = e.currentTarget
            const name = new FormData(form).get('label').trim()
            if (name) {
              action(async () => {
                const res = await supabase
                  .from('application_requirements')
                  .insert({ application_id: applicationId, requirement_name: name })
                if (!res.error) form.reset()
                return res
              })
            }
          }}
        >
          <input
            required
            name="label"
            placeholder="Request document (e.g. Valid ID, Deed of Sale)..."
            maxLength="160"
          />
          <button className="button button-small" disabled={busy}>
            + Request
          </button>
        </form>
      )}
    </section>
  )
}
