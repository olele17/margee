import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupportConversation, getSupportUnread, sendSupportMessage, markSupportRead } from '../services/api';
import '../styles/support-chat.css';

const POLL_OPEN_MS = 5000;    // conversation ouverte : nouvelles réponses
const POLL_CLOSED_MS = 30000; // bouton fermé : pastille « nouveau message »
const MAX_LEN = 2000;

function timeLabel(value) {
  const d = new Date(value);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Messagerie avec l'équipe Margee+ : bouton flottant (toutes les pages de
 * l'espace) et fenêtre de conversation. Les réponses de l'équipe arrivent
 * par relecture régulière ; la pastille signale une réponse non lue.
 */
export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(null);
  const [unread, setUnread] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const buttonRef = useRef(null);

  const load = useCallback(async () => {
    const { messages: list } = await getSupportConversation();
    setMessages(list);
    return list;
  }, []);

  // Pastille : vérifie de temps en temps s'il y a une réponse non lue
  useEffect(() => {
    if (open) return undefined;
    let alive = true;
    const tick = () => getSupportUnread().then((u) => { if (alive) setUnread(u); }).catch(() => {});
    tick();
    const t = setInterval(tick, POLL_CLOSED_MS);
    return () => { alive = false; clearInterval(t); };
  }, [open]);

  // Conversation ouverte : chargement, lecture, relecture régulière
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const refresh = async () => {
      try {
        await load();
        if (alive) { setUnread(false); markSupportRead().catch(() => {}); }
      } catch (e) {
        if (alive) setErr(e.message);
      }
    };
    refresh();
    const t = setInterval(refresh, POLL_OPEN_MS);
    setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => { alive = false; clearInterval(t); document.removeEventListener('keydown', onKey); };
  }, [open, load]);

  // Toujours afficher le dernier message
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  const send = async (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setErr('');
    try {
      await sendSupportMessage(body);
      setDraft('');
      await load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      {open && (
        <section className="sc-panel" role="dialog" aria-modal="false" aria-labelledby="sc-title">
          <header className="sc-head">
            <span className="sc-head-icon" aria-hidden="true"><i className="ti ti-headset" /></span>
            <div className="sc-head-text">
              <h2 id="sc-title" className="sc-title">Équipe Margee+</h2>
              <p className="sc-sub">On te répond ici, généralement dans la journée.</p>
            </div>
            <button type="button" className="sc-close" onClick={() => { setOpen(false); buttonRef.current?.focus(); }} aria-label="Fermer la conversation">
              <i className="ti ti-x" />
            </button>
          </header>

          <div className="sc-list" ref={listRef} aria-live="polite" aria-busy={messages === null}>
            {messages === null && <div className="sc-empty">Chargement…</div>}
            {messages?.length === 0 && (
              <div className="sc-empty">
                <i className="ti ti-message-circle" aria-hidden="true" />
                <p>Une question sur Margee+, ton abonnement ou un paiement ? Écris-nous, on te répond ici.</p>
              </div>
            )}
            {messages?.map((m) => (
              <div key={m.id} className={`sc-msg sc-msg--${m.sender === 'admin' ? 'team' : 'me'}`}>
                {m.sender === 'admin' && <span className="sc-author">Équipe Margee+</span>}
                <div className="sc-bubble">{m.body}</div>
                <time className="sc-time" dateTime={m.created_at}>{timeLabel(m.created_at)}</time>
              </div>
            ))}
          </div>

          {err && <div className="sc-err" role="alert">{err}</div>}

          <form className="sc-form" onSubmit={send}>
            <label htmlFor="sc-input" className="sr-only">Ton message</label>
            <textarea
              id="sc-input"
              ref={inputRef}
              rows={2}
              maxLength={MAX_LEN}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
              placeholder="Écris ton message…"
            />
            <button type="submit" className="sc-send" disabled={!draft.trim() || sending} aria-label="Envoyer">
              <i className={`ti ${sending ? 'ti-loader-2 sc-spin' : 'ti-send'}`} aria-hidden="true" />
            </button>
          </form>
          <div className="sc-hint">Entrée pour envoyer · Maj + Entrée pour aller à la ligne</div>
        </section>
      )}

      <button
        ref={buttonRef}
        type="button"
        className={`sc-fab${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Fermer la conversation avec l\'équipe' : `Écrire à l'équipe Margee+${unread ? ' (nouvelle réponse)' : ''}`}
      >
        <i className={`ti ${open ? 'ti-x' : 'ti-message-circle'}`} aria-hidden="true" />
        {!open && <span className="sc-fab-label">Aide</span>}
        {unread && !open && <span className="sc-dot" aria-hidden="true" />}
      </button>
    </>
  );
}
