import { useEffect, useState } from 'react';
import { api } from './api.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const inr = n => `₹${Number(n).toLocaleString('en-IN')}`;

export default function App() {
  const [tab, setTab] = useState('explore');
  const [auth, setAuth] = useState(() => JSON.parse(localStorage.getItem('trekmate') || 'null'));

  const signIn = s => { localStorage.setItem('trekmate', JSON.stringify(s)); setAuth(s); setTab('explore'); };
  const signOut = () => { localStorage.removeItem('trekmate'); setAuth(null); setTab('explore'); };

  return (
    <>
      <header className="bar">
        <h1>TrekMate</h1>
        <nav>
          {[['explore', 'Treks'], ['plan', 'Trip planner'], ['trips', 'My bookings']].map(([k, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
          {auth
            ? <button onClick={signOut}>Log out ({auth.user.name})</button>
            : <button className={tab === 'login' ? 'on' : ''} onClick={() => setTab('login')}>Log in</button>}
        </nav>
      </header>
      <main>
        {tab === 'explore' && <Explore auth={auth} goLogin={() => setTab('login')} />}
        {tab === 'plan' && <Planner />}
        {tab === 'trips' && <Trips auth={auth} goLogin={() => setTab('login')} />}
        {tab === 'login' && <Login onDone={signIn} />}
      </main>
    </>
  );
}

function Explore({ auth, goLogin }) {
  const [f, setF] = useState({ difficulty: '', month: '', maxDays: '' });
  const [treks, setTreks] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    api(`/treks?${q}`).then(setTreks).catch(e => setError(e.message));
  }, [f]);

  const set = k => e => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <div className="filters">
        <label>Difficulty
          <select value={f.difficulty} onChange={set('difficulty')}>
            <option value="">Any</option><option value="easy">Easy</option>
            <option value="moderate">Moderate</option><option value="hard">Hard</option>
          </select></label>
        <label>Going in
          <select value={f.month} onChange={set('month')}>
            <option value="">Any month</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select></label>
        <label>Max days
          <select value={f.maxDays} onChange={set('maxDays')}>
            <option value="">Any</option><option value="1">1</option><option value="2">2</option>
          </select></label>
      </div>
      {error && <p className="err">{error}</p>}
      {!error && treks.length === 0 && <p className="muted">No treks match these filters. Try another month or difficulty.</p>}
      <div className="grid">{treks.map(t => <TrekCard key={t.id} t={t} auth={auth} goLogin={goLogin} />)}</div>
    </>
  );
}

function TrekCard({ t, auth, goLogin }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ startDate: '', travelers: 1 });
  const [msg, setMsg] = useState('');

  const book = async e => {
    e.preventDefault();
    try {
      const b = await api('/bookings', { method: 'POST', token: auth.token, body: { trekId: t.id, ...form } });
      setMsg(`Booked for ${b.startDate}. Estimated total ${inr(b.total)}.`);
      setOpen(false);
    } catch (err) { setMsg(err.message); }
  };

  return (
    <article className="card">
      <span className={`blaze ${t.difficulty}`} title={t.difficulty} />
      <div>
        <h3>{t.name}</h3>
        <p className="muted">{t.region}</p>
        <p>{t.blurb}</p>
        <p className="facts">{t.days} day{t.days > 1 ? 's' : ''}, {t.distanceKm} km, {t.elevationM} m, entry about {inr(t.fee)}</p>
        <p className="muted">Best: {t.bestMonths.map(m => MONTHS[m - 1]).join(', ')}</p>
        {!open && <button className="primary" onClick={() => (auth ? setOpen(true) : goLogin())}>
          {auth ? 'Book this trek' : 'Log in to book'}</button>}
        {open && (
          <form onSubmit={book} className="inline">
            <input type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            <input type="number" min="1" max="20" value={form.travelers} onChange={e => setForm({ ...form, travelers: e.target.value })} />
            <button className="primary">Confirm booking</button>
          </form>
        )}
        {msg && <p className="muted">{msg}</p>}
      </div>
    </article>
  );
}

function Planner() {
  const [f, setF] = useState({ days: 2, fitness: 'medium', budget: 6000, month: new Date().getMonth() + 1, travelers: 2, notes: '' });
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });

  const run = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { setRes(await api('/plan', { method: 'POST', body: f })); }
    catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <>
      <form className="panel" onSubmit={run}>
        <label>Days free<input type="number" min="1" max="3" value={f.days} onChange={set('days')} /></label>
        <label>Fitness
          <select value={f.fitness} onChange={set('fitness')}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select></label>
        <label>Budget (₹, whole group)<input type="number" min="500" step="500" value={f.budget} onChange={set('budget')} /></label>
        <label>Month
          <select value={f.month} onChange={set('month')}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
        <label>Travelers<input type="number" min="1" max="20" value={f.travelers} onChange={set('travelers')} /></label>
        <label className="wide">Anything else?
          <input value={f.notes} onChange={set('notes')} placeholder="Sunrise views, avoid crowds" /></label>
        <button className="primary" disabled={busy}>{busy ? 'Planning...' : 'Plan my trek'}</button>
      </form>
      {error && <p className="err">{error}</p>}
      {res && (
        <section className="panel result">
          {res.note && <p className="muted">{res.note}</p>}
          <p className="summary">{res.summary}</p>
          {res.picks.map(p => (
            <p key={p.id}><strong>{p.name}</strong>: {p.season} season, about {inr(p.total)} {p.withinBudget ? '(within budget)' : '(over budget)'}</p>
          ))}
          <details>
            <summary>What the planner checked ({res.trace.length} lookups)</summary>
            <ul className="trace">{res.trace.map((t, i) => <li key={i}><code>{t.tool}</code> {JSON.stringify(t.args)} → {JSON.stringify(t.result)}</li>)}</ul>
          </details>
        </section>
      )}
    </>
  );
}

function Trips({ auth, goLogin }) {
  const [list, setList] = useState(null);
  const load = () => api('/bookings/mine', { token: auth.token }).then(setList).catch(() => setList([]));
  useEffect(() => { if (auth) load(); }, [auth]);

  if (!auth) return <p>Log in to see your bookings. <button className="primary" onClick={goLogin}>Log in</button></p>;
  if (!list) return <p className="muted">Loading...</p>;
  if (!list.length) return <p className="muted">No bookings yet. Pick a trek from the Treks tab.</p>;
  return (
    <div className="grid">
      {list.map(b => (
        <article className="card" key={b.id}><div>
          <h3>{b.trekName}</h3>
          <p>{b.startDate}, {b.travelers} traveler{b.travelers > 1 ? 's' : ''}, about {inr(b.total)}</p>
          <button onClick={async () => { await api(`/bookings/${b.id}`, { method: 'DELETE', token: auth.token }); load(); }}>Cancel booking</button>
        </div></article>
      ))}
    </div>
  );
}

function Login({ onDone }) {
  const [signup, setSignup] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const submit = async e => {
    e.preventDefault();
    try { onDone(await api(signup ? '/auth/signup' : '/auth/login', { method: 'POST', body: f })); }
    catch (err) { setError(err.message); }
  };
  return (
    <form className="panel narrow" onSubmit={submit}>
      <h2>{signup ? 'Create your account' : 'Log in'}</h2>
      {signup && <label>Name<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>}
      <label>Email<input type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
      <label>Password<input type="password" required minLength="6" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></label>
      {error && <p className="err">{error}</p>}
      <button className="primary">{signup ? 'Sign up' : 'Log in'}</button>
      <button type="button" onClick={() => setSignup(!signup)}>{signup ? 'I already have an account' : 'Create an account'}</button>
    </form>
  );
}
