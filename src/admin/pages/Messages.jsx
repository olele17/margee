import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listThreads, getThread, sendTeamMessage, setThreadStatus } from '../adminApi';
import { dateTimeFr } from '../format';
import '../../styles/dashboard.css';

const LIST_POLL_MS = 15000;
const THREAD_POLL_MS = 5000;

function shortTime(value) {
  const d = new Date(value);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dakar' })
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Africa/Dakar' });
}

/* ── Conversation ouverte ──────────────────────────────────────── */
function Thread({ accountId, onChanged, onBack }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const load = useCallback(() => getThread(accountId).then(setData), [accountId]);

  useEffect(() => {
    let alive = true;
    setData(null);
    setErr('');
    setDraft('');
    const tick = () => load().catch((e) => { if (alive) setErr(e.message); });
    tick().then(() => onChanged?.());
    const t = setInterval(tick, THREAD_POLL_MS);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [data?.messages?.length]);

  const send = async (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setErr('');
    try {
      await sendTeamMessage(accountId, body);
      setDraft('');
      await load();
      onChanged?.();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const toggleStatus = async () => {
    try {
      await setThreadStatus(accountId, data.thread.status === 'open' ? 'closed' : 'open');
      await load();
      onChanged?.();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  if (!data) return <div className="adm-msg-thread adm-msg-empty">{err || 'Chargement…'}</div>;
  const a = data.account || {};
  const closed = data.thread?.status === 'closed';

  return (
    <section className="adm-msg-thread" aria-labelledby="adm-msg-title">
      <header className="adm-msg-head">
        <button type="button" className="btn btn-ghost btn-sm adm-msg-back" onClick={onBack} aria-label="Retour à la liste">
          <i className="ti ti-arrow-left" aria-hidden="true" />
        </button>
        <div className="adm-msg-head-text">
          <h2 id="adm-msg-title" className="adm-msg-title">{a.business_name || 'Compte'}</h2>
          <div className="adm-sub">{[a.owner_name, a.email, a.phone].filter(Boolean).join(' · ')}</div>
        </div>
        <Link className="btn btn-outline btn-sm" to={`/admin/marchands/${accountId}`}>
          <i className="ti ti-id" aria-hidden="true" /> Fiche
        </Link>
        {data.thread && (
          <button type="button" className={`btn btn-sm ${closed ? 'btn-outline' : 'btn-dark'}`} onClick={toggleStatus}>
            <i className={`ti ${closed ? 'ti-refresh' : 'ti-check'}`} aria-hidden="true" /> {closed ? 'Rouvrir' : 'Marquer résolue'}
          </button>
        )}
      </header>

      <div className="adm-msg-list" ref={listRef} aria-live="polite">
        {data.messages.length === 0 && (
          <div className="adm-msg-empty">Aucun message pour l'instant. Tu peux écrire le premier : il apparaîtra dans le chat de l'e-commerçant.</div>
        )}
        {data.messages.map((m) => (
          <div key={m.id} className={`adm-msg adm-msg--${m.sender === 'admin' ? 'team' : 'client'}`}>
            <div className="adm-msg-bubble">{m.body}</div>
            <div className="adm-msg-meta">
              {m.sender === 'admin' ? `Équipe · ${m.author_email || 'admin'}` : a.business_name} · {dateTimeFr(m.created_at)}
            </div>
          </div>
        ))}
      </div>

      {err && <div className="db-filter-err" role="alert">{err}</div>}
      {closed && <div className="adm-msg-closed"><i className="ti ti-check" aria-hidden="true" /> Conversation résolue. Une nouvelle réponse (de toi ou du client) la rouvre.</div>}

      <form className="adm-msg-form" onSubmit={send}>
        <label htmlFor="adm-msg-input" className="sr-only">Ta réponse</label>
        <textarea
          id="adm-msg-input"
          ref={inputRef}
          rows={3}
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e); }}
          placeholder="Ta réponse (le client voit « Équipe Margee+ »)…"
        />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim() || sending}>
          <i className={`ti ${sending ? 'ti-loader-2 adm-spin' : 'ti-send'}`} aria-hidden="true" /> Envoyer
        </button>
      </form>
      <div className="adm-sub adm-msg-hint">Ctrl + Entrée pour envoyer</div>
    </section>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */
export default function Messages() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('compte') || '';
  const filter = params.get('filtre') || 'open'; // open | unread | closed | all
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const loadList = useCallback(() => listThreads({
    status: filter === 'open' ? 'open' : filter === 'closed' ? 'closed' : '',
    unread: filter === 'unread' ? 'yes' : '',
    search: search.trim(),
  }).then((d) => { setData(d); setErr(''); }).catch((e) => setErr(e.message)), [filter, search]);

  useEffect(() => {
    const t0 = setTimeout(loadList, search ? 300 : 0);
    const t = setInterval(loadList, LIST_POLL_MS);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [loadList, search]);

  const set = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  const rows = data?.rows || [];
  const FILTERS = [['open', 'Ouvertes'], ['unread', `À répondre${data?.unread_total ? ` (${data.unread_total})` : ''}`], ['closed', 'Résolues'], ['all', 'Toutes']];

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1 className="adm-page-title">Messages</h1>
          <div className="adm-page-sub">
            Conversations avec les e-commerçants. Le client voit « Équipe Margee+ » ; ici, chaque réponse garde le nom de son auteur.
          </div>
        </div>
      </div>

      <div className={`adm-msg-layout${selected ? ' has-thread' : ''}`}>
        <section className="db-card adm-msg-side" aria-label="Conversations">
          <div className="adm-input-icon adm-msg-search">
            <i className="ti ti-search" aria-hidden="true" />
            <input type="search" aria-label="Rechercher une conversation" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Boutique, email ou message" />
          </div>
          <div className="adm-seg adm-msg-filters" role="group" aria-label="Filtrer les conversations">
            {FILTERS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? 'is-on' : ''} onClick={() => set({ filtre: k === 'open' ? '' : k })}>{label}</button>
            ))}
          </div>
          {err && <div className="db-filter-err" role="alert">{err}</div>}
          <ul className="adm-msg-threads">
            {data && rows.length === 0 && <li className="adm-msg-empty">Aucune conversation.</li>}
            {rows.map((r) => (
              <li key={r.account_id}>
                <button
                  type="button"
                  className={`adm-msg-item${selected === r.account_id ? ' is-active' : ''}${r.unread ? ' is-unread' : ''}`}
                  onClick={() => set({ compte: r.account_id })}
                  aria-current={selected === r.account_id ? 'true' : undefined}
                >
                  <span className="adm-msg-item-top">
                    <span className="adm-msg-item-name">{r.business_name}</span>
                    <span className="adm-msg-item-time">{shortTime(r.last_message_at)}</span>
                  </span>
                  <span className="adm-msg-item-preview">
                    {r.last_sender === 'admin' && <span className="adm-msg-you">Équipe : </span>}{r.last_preview}
                  </span>
                  <span className="adm-msg-item-tags">
                    {r.unread && <span className="badge pending"><i className="ti ti-point-filled" aria-hidden="true" />À répondre</span>}
                    {r.status === 'closed' && <span className="badge ok"><i className="ti ti-check" aria-hidden="true" />Résolue</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {selected
          ? <Thread key={selected} accountId={selected} onChanged={loadList} onBack={() => set({ compte: '' })} />
          : <div className="db-card adm-msg-thread adm-msg-empty adm-msg-placeholder"><i className="ti ti-messages" aria-hidden="true" /> Choisis une conversation à gauche.</div>}
      </div>
    </div>
  );
}
