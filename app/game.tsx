'use client';
// Auth endpoints are dispatch-owned and require full top-level navigation.
/* oxlint-disable next/no-html-link-for-pages */
// These static images are already WebP-compressed (122 KB and 142 KB); no image server is needed.
/* oxlint-disable next/no-img-element */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
  type ReactNode,
} from 'react';
import type { CampaignAttention } from '../lib/game/attention';
import { useActionDraft } from '../lib/action-drafts';
import { Dialog } from '@base-ui/react/dialog';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Compass,
  Copy,
  Dices,
  Download,
  Heart,
  MapPin,
  MessageCircle,
  Plus,
  Send,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Swords,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  ABILITY_EFFECTS,
  MAX_LEVEL,
  nextLevelXp,
  PRESETS,
  ROLES,
  roleHealth,
  roleArmor,
  WORLDS,
  type CampaignView,
  type Character,
  type Journal,
  type Settings,
  type Stats,
  type User,
} from '../lib/game/types';
type Summary = {
  id: string;
  title: string;
  location: string;
  setting: string;
  dm: string;
  players: number;
  updatedAt: string;
  unread: number;
  attention: CampaignAttention;
};
type Tab = 'Adventure' | 'Journal' | 'Map' | 'DM Desk';
type Post = (data: Record<string, unknown>) => Promise<boolean>;
async function request<T = CampaignView>(
  path = '',
  data?: Record<string, unknown>,
): Promise<T> {
  const r = await fetch(
    `/api/game${path}`,
    data
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      : { cache: 'no-store' },
  );
  const value = await r.json();
  if (!r.ok)
    throw new Error(
      (value as { error?: string }).error ||
        'Something went wrong. Please try again.',
    );
  return value as T;
}
function Portrait({
  index = 0,
  src,
  large = false,
}: {
  index?: number;
  src?: string;
  large?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`portrait ${large ? 'large' : ''}`}
      style={{
        backgroundPosition: src
          ? 'center'
          : `${index % 2 ? 100 : 0}% ${index > 1 ? 100 : 0}%`,
        ...(src
          ? {
              backgroundImage: `url(${JSON.stringify(src)})`,
              backgroundSize: 'cover',
            }
          : {}),
      }}
    />
  );
}
function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop" />
        <Dialog.Popup className={`modal ${wide ? 'wide' : ''}`}>
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
const stamp = (v: string) =>
  new Date(v).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export default function Game() {
  const [user, setUser] = useState<User | null>(null);
  const [local, setLocal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Summary[]>([]);
  const [campaign, setCampaign] = useState<CampaignView | null>(null);
  const [tab, setTab] = useState<Tab>('Adventure');
  const [panel, setPanel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [catchUp, setCatchUp] = useState('');
  const busyRef = useRef(false);
  const refreshList = useCallback(async () => {
    setCampaigns(await request<Summary[]>());
  }, []);
  const enter = useCallback(
    async (id: string) => {
      const c: CampaignView = await request(`?id=${encodeURIComponent(id)}`);
      setCampaign(c);
      setTab('Adventure');
      setPanel('');
      history.replaceState(null, '', `/?campaign=${id}`);
      const seen =
        c.state.seen[
          c.members.find((m) => m.userId === user?.id)?.userId || ''
        ];
      const changes = c.state.events.filter(
        (e) => e.kind !== 'chat' && e.at > (seen || ''),
      );
      setCatchUp(
        seen
          ? `${changes.length} new ${changes.length === 1 ? 'event' : 'events'} since your last visit.`
          : 'Your story starts here.',
      );
    },
    [user],
  );
  useEffect(() => {
    let active = true;
    request<{ user: User | null; local: boolean }>('?op=session')
      .then(async (session) => {
        if (!active) return;
        setUser(session.user);
        setLocal(session.local);
        const params = new URLSearchParams(location.search);
        if (params.get('invite')) setJoinCode(params.get('invite')!);
        if (session.user) {
          setCampaigns(await request<Summary[]>());
          if (params.get('campaign')) {
            const c = await request(
              `?id=${encodeURIComponent(params.get('campaign')!)}`,
            );
            if (active) {
              setCampaign(c);
              const seen = c.state.seen[session.user.id];
              const n = c.state.events.filter(
                (e: { kind: string; at: string }) =>
                  e.kind !== 'chat' && e.at > (seen || ''),
              ).length;
              setCatchUp(
                seen
                  ? `${n} new events since your last visit.`
                  : 'Your story starts here.',
              );
            }
          }
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!user || campaign) return;
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || document.visibilityState === 'hidden') return;
      refreshing = true;
      try {
        const next = await request<Summary[]>();
        if (active) setCampaigns(next);
      } catch {
        // Keep the last successful list during a temporary connection failure.
      } finally {
        refreshing = false;
      }
    };
    const interval = setInterval(() => void refresh(), 15000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user, campaign]);
  useEffect(() => {
    if (!campaign?.id) return;
    let active = true;
    const refresh = async () => {
      if (busyRef.current || document.visibilityState === 'hidden') return;
      try {
        let c = await request(`?id=${encodeURIComponent(campaign.id)}`);
        const encounter = c.state.encounter;
        const actor =
          encounter &&
          c.state.characters.find(
            (p) => p.id === encounter.order[encounter.index],
          );
        if (
          active &&
          !busyRef.current &&
          encounter?.deadline &&
          Date.parse(encounter.deadline) <= Date.now() &&
          c.state.settings.absence === 'defend' &&
          actor?.absenceConsent
        ) {
          try {
            c = await request('', {
              op: 'tick',
              id: c.id,
              requestId: crypto.randomUUID(),
            });
          } catch {
            /* A concurrent action owns the turn; the next refresh will catch up. */
          }
        }
        if (active && !busyRef.current) setCampaign(c);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    const timer = setInterval(refresh, 7000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [campaign?.id]);
  const post: Post = async (data) => {
    if (busyRef.current) return false;
    setError('');
    setBusy(true);
    busyRef.current = true;
    try {
      const c = campaign;
      const result = await request('', {
        ...(c ? { id: c.id, version: c.version } : {}),
        requestId: crypto.randomUUID(),
        ...data,
      });
      if (result.state) {
        setCampaign(result);
        history.replaceState(null, '', `/?campaign=${result.id}`);
      }
      return true;
    } catch (e) {
      setError((e as Error).message);
      if (campaign)
        try {
          setCampaign(await request(`?id=${campaign.id}`));
        } catch {}
      return false;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };
  async function uploadImage(
    file: File,
    kind: 'portrait' | 'scene' = 'portrait',
  ) {
    if (busyRef.current || !campaign) return false;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/${kind}?campaign=${encodeURIComponent(campaign.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        },
      );
      const result = (await response.json()) as CampaignView & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Could not upload image.');
      setCampaign(result);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function back() {
    if (campaign) await post({ op: 'seen' });
    setCampaign(null);
    setPanel('');
    history.replaceState(null, '', '/');
    await refreshList();
  }
  async function doJoin(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    let code = joinCode.trim();
    try {
      if (code.startsWith('http'))
        code = new URL(code).searchParams.get('invite') || code;
    } catch {}
    if (await post({ op: 'join', invite: code })) {
      setJoinCode('');
      setCatchUp(
        'Welcome to the party. Create your character to join the adventure.',
      );
    }
  }
  async function copyInvite() {
    if (!campaign?.invite) return;
    const value = `${location.origin}/?invite=${campaign.invite}`;
    try {
      await navigator.clipboard.writeText(value);
      setNotice('Invitation copied.');
    } catch {
      setNotice(`Invite: ${value}`);
    }
  }
  function exportCampaign() {
    if (!campaign) return;
    const blob = new Blob([JSON.stringify(campaign, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lantern-campaign.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  const me = campaign?.state.characters.find((c) => c.userId === user?.id);
  const host = campaign?.hostId === user?.id;
  const guiding = host && campaign?.state.settings.dm !== 'ai';
  if (loading)
    return (
      <main className="loading">
        <Compass size={30} />
        <p>Opening your table…</p>
      </main>
    );
  return (
    <div className="app-shell">
      {!campaign ? (
        <>
          <header className="lobby-header">
            <span className="brand">
              <Compass size={23} /> Lantern Table
            </span>
            {user && (
              <span className="account">
                {user.name}
                {__LANTERN_RAILWAY__ && (
                  <a href="/api/auth?password" target="_top">
                    Change password
                  </a>
                )}
                <a
                  href={
                    __LANTERN_RAILWAY__
                      ? '/api/auth?logout'
                      : __LANTERN_STANDALONE__
                        ? '/cdn-cgi/access/logout'
                        : '/signout-with-chatgpt?return_to=/'
                  }
                  target="_top"
                >
                  Sign out
                </a>
              </span>
            )}
          </header>
          <main className="lobby">
            {!user ? (
              <section className="welcome">
                <img
                  className="welcome-art"
                  src="/art/harbor.webp"
                  alt="A lantern-lit tavern beside a rainy harbor"
                  width={700}
                  height={580}
                />
                <div className="welcome-copy">
                  <h1>A place for your next adventure.</h1>
                  <p>
                    Gather your friends. Build a world. Take your turn when life
                    allows.
                  </p>
                  <a
                    className="primary button-link"
                    href={
                      __LANTERN_RAILWAY__
                        ? '/api/auth'
                        : __LANTERN_STANDALONE__
                          ? locationSafe()
                          : `/signin-with-chatgpt?return_to=${encodeURIComponent(locationSafe())}`
                    }
                    target="_top"
                  >
                    Sign in to play <ArrowRight size={18} />
                  </a>
                  <p className="muted">
                    Private campaigns · Human or AI dungeon master
                  </p>
                  {local && (
                    <div className="local-players">
                      <p>Local development players</p>
                      {['Joe', 'Mara', 'Felix'].map((name, i) => (
                        <button
                          key={name}
                          onClick={async () => {
                            await request('', {
                              op: 'localLogin',
                              id: `local_${i + 1}`,
                            });
                            location.reload();
                          }}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <h1>Your adventures</h1>
                    <p className="muted">
                      A familiar world, whenever you return.
                    </p>
                  </div>
                  <button
                    className="primary"
                    onClick={() => setPanel('create')}
                  >
                    <Plus size={18} /> New campaign
                  </button>
                </div>
                {campaigns.length ? (
                  <div className="campaign-list">
                    {campaigns.map((c) => (
                      <button
                        key={c.id}
                        className="campaign-row"
                        onClick={() =>
                          enter(c.id).catch((e) => setError(e.message))
                        }
                      >
                        <div className="campaign-thumbnail" />
                        <div>
                          <h2>{c.title}</h2>
                          <p>{c.location}</p>
                          <p>
                            {c.attention?.needsAction ? (
                              <strong>{c.attention.label}</strong>
                            ) : (
                              c.attention?.label
                            )}
                            {c.unread > 0 && (
                              <>
                                {' '}
                                · {c.unread} new{' '}
                                {c.unread === 1 ? 'event' : 'events'}
                              </>
                            )}
                          </p>
                          <span className="muted">
                            {c.players}{' '}
                            {c.players === 1 ? 'character' : 'characters'} ·{' '}
                            {c.dm === 'ai'
                              ? 'AI dungeon master'
                              : 'Human dungeon master'}
                          </span>
                        </div>
                        <ArrowRight size={22} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="first-campaign">
                    <Compass size={38} />
                    <h2>Your table is waiting.</h2>
                    <p>
                      Create a campaign, or join a friend with an invitation.
                    </p>
                  </div>
                )}
                <form className="join-form" onSubmit={doJoin}>
                  <Field label="Join an adventure">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      placeholder="Paste an invitation link or code"
                      required
                    />
                  </Field>
                  <button disabled={busy || !joinCode.trim()}>
                    Join campaign <ArrowRight size={16} />
                  </button>
                </form>
              </>
            )}
          </main>
        </>
      ) : (
        <>
          <header className="game-header">
            <button
              className="campaign-switch"
              onClick={back}
              aria-label="Back to campaigns"
            >
              <Compass size={22} />
              <span>{campaign.state.title}</span>
              <ChevronDown size={14} />
            </button>
            <nav aria-label="Campaign navigation">
              {(
                [
                  'Adventure',
                  'Journal',
                  'Map',
                  ...(host ? ['DM Desk'] : []),
                ] as Tab[]
              ).map((t) => (
                <button
                  key={t}
                  aria-current={tab === t ? 'page' : undefined}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </nav>
            <div className="party-mini">
              {campaign.state.characters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setPanel(`member:${c.id}`)}
                  title={`${c.name} · ${c.hp}/${c.maxHp} health`}
                  aria-label={`View ${c.name}`}
                >
                  <Portrait src={c.portraitUrl} index={c.portrait} />
                </button>
              ))}
              <button
                className="icon-button"
                aria-label="Campaign settings"
                onClick={() => setPanel('settings')}
              >
                <SettingsIcon size={19} />
              </button>
            </div>
          </header>
          <main>
            {tab === 'Adventure' && (
              <>
                <div
                  className={`scene ${campaign.state.sceneUrl || campaign.state.setting.toLowerCase().includes('fantasy') ? 'harbor' : 'other-world'}`}
                >
                  {(campaign.state.sceneUrl ||
                    campaign.state.setting
                      .toLowerCase()
                      .includes('fantasy')) && (
                    <img
                      src={campaign.state.sceneUrl || '/art/harbor.webp'}
                      alt={
                        campaign.state.sceneUrl
                          ? ''
                          : 'A lantern-lit harbor tavern'
                      }
                      width={1672}
                      height={941}
                    />
                  )}
                  <span className="scene-caption">
                    <MapPin size={14} />
                    {campaign.state.location}
                  </span>
                </div>
                <div className="adventure-content">
                  <div className="location-heading">
                    <h1>{campaign.state.location}</h1>
                    <span className="dm-label">
                      {campaign.state.settings.dm === 'ai'
                        ? 'AI dungeon master'
                        : campaign.state.settings.dm === 'assisted'
                          ? 'Human DM · AI assisted'
                          : 'Human dungeon master'}
                    </span>
                  </div>
                  {catchUp && (
                    <p className="catch-up">
                      <BookOpen size={15} />
                      {catchUp}
                      <button
                        onClick={() => {
                          void post({ op: 'seen' });
                          setCatchUp('');
                        }}
                      >
                        Mark read
                      </button>
                    </p>
                  )}
                  {!me && (
                    <div className="join-character">
                      <div>
                        <h2>
                          {guiding
                            ? 'You’re the dungeon master'
                            : 'Who will you be?'}
                        </h2>
                        <p>
                          {guiding
                            ? 'Guide the story from DM Desk and talk with your players in Party chat. A player character is optional.'
                            : 'Create a character to take part in this adventure.'}
                        </p>
                      </div>
                      <button
                        className="primary"
                        onClick={() =>
                          guiding ? setTab('DM Desk') : setPanel('builder')
                        }
                      >
                        {guiding ? 'Open DM Desk' : 'Create character'}{' '}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                  {campaign.state.decision && (
                    <PartyDecision
                      campaign={campaign}
                      user={user!}
                      post={post}
                      busy={busy}
                    />
                  )}
                  <Story campaign={campaign} />
                  {campaign.state.encounter ? (
                    <Encounter
                      campaign={campaign}
                      user={user!}
                      post={post}
                      busy={busy}
                    />
                  ) : (
                    me && (
                      <ActionBox
                        key={`${campaign.id}:${me.userId}`}
                        campaign={campaign}
                        post={post}
                        busy={busy}
                        me={me}
                        onDecision={() => setPanel('decision')}
                      />
                    )
                  )}
                  <footer className="play-footer">
                    <button
                      onClick={() => setPanel(me ? 'character' : 'builder')}
                    >
                      <UserRound size={17} />
                      {me ? 'Character' : 'Create character'}
                    </button>
                    <button onClick={() => setPanel('chat')}>
                      <MessageCircle size={17} />
                      Party chat
                    </button>
                    <span>Progress saves automatically</span>
                  </footer>
                </div>
              </>
            )}
            {tab === 'Journal' && (
              <JournalView campaign={campaign} host={!!host} post={post} />
            )}
            {tab === 'Map' && (
              <div className="secondary-page">
                <div className="page-heading">
                  <div>
                    <h1>Your map</h1>
                    <p className="muted">Places your party has discovered.</p>
                  </div>
                </div>
                {campaign.state.encounter ? (
                  <Encounter
                    campaign={campaign}
                    user={user!}
                    post={post}
                    busy={busy}
                  />
                ) : (
                  <div className="places">
                    {campaign.state.visited.map((place, i) => (
                      <div key={place} className="place">
                        <span className="place-index">{i + 1}</span>
                        <MapPin size={22} />
                        <h2>{place}</h2>
                        <p className="muted">
                          {place === campaign.state.location
                            ? 'You are here'
                            : 'Previously visited'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="muted">
                  Exploration uses discovered locations. A tactical grid appears
                  during encounters.
                </p>
              </div>
            )}
            {tab === 'DM Desk' && host && (
              <DMDesk
                campaign={campaign}
                post={post}
                busy={busy}
                setError={setError}
              />
            )}
          </main>
        </>
      )}
      {error && (
        <div className="toast error" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={18} />
          </button>
        </div>
      )}
      {notice && (
        <output className="toast">
          <span>{notice}</span>
          <button aria-label="Dismiss" onClick={() => setNotice('')}>
            <X size={18} />
          </button>
        </output>
      )}
      <Modal
        open={panel === 'create'}
        onClose={() => setPanel('')}
        title="Create an adventure"
        wide
      >
        <CampaignBuilder
          busy={busy}
          onCreate={async (v) => {
            if (await post({ op: 'create', ...v })) {
              setPanel((v.settings as Settings).dm === 'ai' ? 'builder' : '');
              setCatchUp('Your story starts here.');
            }
          }}
        />
      </Modal>
      {campaign && (
        <>
          <Modal
            open={panel === 'builder'}
            onClose={() => setPanel('')}
            title="Create your character"
            wide
          >
            <CharacterBuilder
              campaign={campaign}
              busy={busy}
              onCreate={async (v) => {
                if (await post({ op: 'character', ...v })) setPanel('');
              }}
            />
          </Modal>
          <Modal
            open={panel === 'character' || panel.startsWith('member:')}
            onClose={() => setPanel('')}
            title={panel === 'character' ? 'Your character' : 'Party member'}
          >
            <CharacterSheet
              key={panel === 'character' ? me?.id : panel}
              character={
                panel === 'character'
                  ? me
                  : campaign.state.characters.find(
                      (c) => c.id === panel.split(':')[1],
                    )
              }
              advancementBlocked={
                !!(
                  campaign.state.encounter ||
                  campaign.state.decision ||
                  campaign.state.pending.length
                )
              }
              customAllowed={campaign.state.settings.customization === 'custom'}
              upload={uploadImage}
              own={panel === 'character'}
              post={post}
              busy={busy}
            />
          </Modal>
          <Modal
            open={panel === 'chat'}
            onClose={() => setPanel('')}
            title="Party chat"
          >
            <Chat
              campaign={campaign}
              post={post}
              busy={busy}
              canSend={!!me || !!host}
            />
          </Modal>
          <Modal
            open={panel === 'settings'}
            onClose={() => setPanel('')}
            title="Campaign settings"
            wide
          >
            <SettingsPanel
              campaign={campaign}
              host={!!host}
              busy={busy}
              onSave={async (settings) => {
                if (await post({ op: 'settings', settings })) {
                  setNotice('Settings saved.');
                  setPanel('');
                }
              }}
            />
            <WorldEditor
              campaign={campaign}
              host={!!host}
              busy={busy}
              onSave={async (world) => {
                if (await post({ op: 'world', ...world })) {
                  setNotice('Campaign world saved.');
                  setPanel('');
                }
              }}
            />
            {host && (
              <SceneArtwork
                campaign={campaign}
                busy={busy}
                upload={(file) => uploadImage(file, 'scene')}
                post={post}
              />
            )}
            <div className="settings-footer">
              {host && (
                <button onClick={copyInvite}>
                  <Copy size={16} />
                  Copy invitation
                </button>
              )}
              <button onClick={exportCampaign}>
                <Download size={16} />
                Export campaign
              </button>
            </div>
          </Modal>
          <Modal
            open={panel === 'decision'}
            onClose={() => setPanel('')}
            title="Ask the party"
          >
            <DecisionForm
              busy={busy}
              onCreate={async (v) => {
                if (await post({ op: 'decision', ...v })) setPanel('');
              }}
            />
          </Modal>
        </>
      )}
    </div>
  );
}
function locationSafe() {
  return typeof window === 'undefined'
    ? '/'
    : window.location.pathname + window.location.search;
}
function Story({ campaign }: { campaign: CampaignView }) {
  const [all, setAll] = useState(false);
  const events = campaign.state.events.filter((e) => e.kind !== 'chat');
  const shown = all ? events : events.slice(-5);
  return (
    <section className="story" aria-label="Adventure history">
      {events.length > 5 && (
        <button className="history-toggle" onClick={() => setAll(!all)}>
          {all
            ? 'Show recent events'
            : `Read earlier events (${events.length - 5})`}
        </button>
      )}
      {shown.map((e) => (
        <article key={e.id} className={`event event-${e.kind}`}>
          <div className="event-meta">
            <span>
              {e.kind === 'roll' ? <Dices size={15} /> : null}
              {e.author}
            </span>
            <time dateTime={e.at}>{stamp(e.at)}</time>
          </div>
          <p>{e.text}</p>
        </article>
      ))}
    </section>
  );
}
function ActionBox({
  campaign,
  me,
  post,
  busy,
  onDecision,
}: {
  campaign: CampaignView;
  me: Character;
  post: Post;
  busy: boolean;
  onDecision: () => void;
}) {
  const draftKey = `lantern:action-draft:${me.userId}:${campaign.id}`;
  const [draft, saveDraft, clearSubmittedDraft] = useActionDraft(draftKey);
  const { text: value, roll, skill, saved: draftSaved } = draft;
  const pending = campaign.state.pending.some((p) => p.userId === me.userId);
  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (await post({ op: 'action', text: value, roll, skill }))
      clearSubmittedDraft();
  }
  return (
    <section className="action-area">
      <div className="suggestions">
        {campaign.state.suggestions.map((s) => (
          <button
            key={s}
            onClick={() => saveDraft(s)}
            disabled={pending || busy}
          >
            {s}
            <ArrowRight size={14} />
          </button>
        ))}
      </div>
      {pending && (
        <p className="waiting">
          Your action is saved and waiting for the human DM. You can come back
          later.
        </p>
      )}
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="action">
          What do you do?
        </label>
        <div className="composer">
          <textarea
            id="action"
            value={value}
            onChange={(e) => saveDraft(e.target.value)}
            placeholder="What do you do?"
            rows={2}
            maxLength={1500}
            disabled={pending || busy}
            required
          />
          <button
            className="primary"
            aria-label="Send action"
            disabled={busy || pending || !value.trim()}
          >
            <Send size={19} />
          </button>
        </div>
        <div className="action-options">
          <label>
            <input
              type="checkbox"
              checked={roll}
              disabled={busy}
              onChange={(e) => saveDraft(value, e.target.checked)}
            />
            Make a check
          </label>
          {roll && (
            <select
              aria-label="Check attribute"
              value={skill}
              disabled={busy}
              onChange={(e) => saveDraft(value, roll, e.target.value)}
            >
              {Object.keys(me.stats).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={onDecision}
            disabled={!!campaign.state.decision}
          >
            Ask the party
          </button>
        </div>
        {value && !busy && (
          <p className="muted">
            {draftSaved
              ? 'Draft saved on this device · not sent'
              : 'Draft not saved on this device'}
          </p>
        )}
        {busy && <output className="muted">Resolving your action…</output>}
      </form>
    </section>
  );
}
function SettingFields({
  value,
  onChange,
  disabled = false,
}: {
  value: Settings;
  onChange: (v: Settings) => void;
  disabled?: boolean;
}) {
  const set = (k: keyof Settings, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <fieldset disabled={disabled} className="settings-fields">
      <div className="form-grid">
        <Field label="Dungeon master">
          <select value={value.dm} onChange={(e) => set('dm', e.target.value)}>
            <option value="ai">AI dungeon master</option>
            <option value="human">Human dungeon master</option>
            <option value="assisted">Human with AI assistance</option>
          </select>
        </Field>
        <Field label="Rules">
          <select
            value={value.rules}
            onChange={(e) => set('rules', e.target.value)}
          >
            <option value="quickplay">Quickplay · simple & flexible</option>
            <option value="tactical">
              Tactical · attributes, range & resources
            </option>
          </select>
        </Field>
        <Field label="Play pace">
          <select
            value={value.pace}
            onChange={(e) => set('pace', e.target.value)}
          >
            <option value="wait">No rush · wait for players</option>
            <option value="deadline">Timed turns</option>
            <option value="host">Host-managed</option>
          </select>
        </Field>
        <Field label="Turn deadline (hours)">
          <input
            type="number"
            value={value.deadlineHours}
            min={1}
            max={168}
            onChange={(e) => set('deadlineHours', Number(e.target.value))}
          />
        </Field>
        <Field label="After a missed combat turn">
          <select
            value={value.absence}
            onChange={(e) => set('absence', e.target.value)}
          >
            <option value="wait">Keep waiting</option>
            <option value="defend">Defend, if the player consents</option>
          </select>
        </Field>
        <Field label="Party decisions">
          <select
            value={value.decision}
            onChange={(e) => set('decision', e.target.value)}
          >
            <option value="unanimous">Everyone agrees</option>
            <option value="majority">Majority agrees</option>
            <option value="host">Host chooses</option>
          </select>
        </Field>
        <Field label="Character customization">
          <select
            value={value.customization}
            onChange={(e) => set('customization', e.target.value)}
          >
            <option value="standard">Standard species and roles</option>
            <option value="reskin">Custom concepts, existing abilities</option>
            <option value="custom">Custom concepts + approved abilities</option>
          </select>
        </Field>
        <Field label="Tone">
          <input
            value={value.tone}
            maxLength={100}
            onChange={(e) => set('tone', e.target.value)}
          />
        </Field>
      </div>
      <Field label="Themes to avoid">
        <textarea
          value={value.boundaries}
          maxLength={1000}
          rows={2}
          onChange={(e) => set('boundaries', e.target.value)}
          placeholder="Optional boundaries for this campaign"
        />
      </Field>
    </fieldset>
  );
}
function CampaignBuilder({
  onCreate,
  busy,
}: {
  onCreate: (v: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [world, setWorld] = useState('fantasy');
  const [title, setTitle] = useState(WORLDS[0].name);
  const [setting, setSetting] = useState(WORLDS[0].setting);
  const [premise, setPremise] = useState(WORLDS[0].premise);
  const [location, setLocation] = useState(WORLDS[0].location);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ title, setting, premise, location, settings });
      }}
    >
      <div className="world-options">
        {[
          ...WORLDS.map((w) => ({
            id: w.id,
            name:
              w.id === 'scifi'
                ? 'Science fiction'
                : w.id === 'mystery'
                  ? 'Modern mystery'
                  : 'Fantasy',
          })),
          { id: 'custom', name: 'Your own world' },
        ].map((w) => (
          <button
            type="button"
            key={w.id}
            className={world === w.id ? 'selected' : ''}
            aria-pressed={world === w.id}
            onClick={() => {
              setWorld(w.id);
              const p = WORLDS.find((x) => x.id === w.id);
              if (p) {
                setTitle(p.name);
                setSetting(p.setting);
                setPremise(p.premise);
                setLocation(p.location);
              } else {
                setTitle('');
                setSetting('');
                setPremise('');
                setLocation('');
              }
            }}
          >
            {w.name}
          </button>
        ))}
      </div>
      <Field label="Campaign name">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          required
        />
      </Field>
      <Field label="World and era">
        <textarea
          value={setting}
          onChange={(e) => setSetting(e.target.value)}
          maxLength={1500}
          rows={2}
          required
        />
      </Field>
      <Field label="The opening mystery or adventure">
        <textarea
          value={premise}
          onChange={(e) => setPremise(e.target.value)}
          maxLength={1500}
          rows={3}
          required
        />
      </Field>
      <Field label="Starting location">
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={80}
          required
        />
      </Field>
      <details>
        <summary>Rules, scheduling & customization</summary>
        <SettingFields value={settings} onChange={setSettings} />
      </details>
      <p className="muted">
        Quickplay and Tactical are original rulesets. Tactical adds attribute
        modifiers, positioning, and range; it is not full D&D 5e.
      </p>
      <button className="primary full" disabled={busy}>
        Create campaign <ArrowRight size={17} />
      </button>
    </form>
  );
}
function CharacterBuilder({
  campaign,
  onCreate,
  busy,
}: {
  campaign: CampaignView;
  onCreate: (v: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState('Ready-made');
  const [v, setV] = useState({
    ...PRESETS[0],
    stats: {
      strength: 10,
      dexterity: 15,
      constitution: 13,
      intelligence: 8,
      wisdom: 14,
      charisma: 12,
    } as Stats,
    absenceConsent: false,
  });
  const set = (k: string, value: unknown) =>
    setV((p) => ({ ...p, [k]: value }));
  const assign = (key: keyof Stats, value: number) => {
    const old = v.stats[key];
    const other = (Object.keys(v.stats) as (keyof Stats)[]).find(
      (k) => k !== key && v.stats[k] === value,
    );
    set('stats', {
      ...v.stats,
      [key]: value,
      ...(other ? { [other]: old } : {}),
    });
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate(v);
      }}
    >
      <div className="subtabs">
        {['Ready-made', 'Describe your character', 'Full builder'].map((m) => (
          <button
            type="button"
            key={m}
            className={mode === m ? 'active' : ''}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      {mode === 'Ready-made' && (
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p.name}
              className={v.portrait === p.portrait ? 'selected' : ''}
              aria-pressed={v.portrait === p.portrait}
              onClick={() => setV({ ...v, ...p })}
            >
              <Portrait index={p.portrait} />
              <strong>{p.name}</strong>
              <span>{p.role}</span>
            </button>
          ))}
        </div>
      )}
      <div className="character-preview">
        <Portrait index={v.portrait} large />
        <div>
          <h2>{v.name || 'Your character'}</h2>
          <p className="muted">
            {v.ancestry} · {v.role}
          </p>
          <div className="portrait-picker">
            {PRESETS.map((p) => (
              <button
                type="button"
                aria-label={`Use portrait ${p.portrait + 1}`}
                key={p.portrait}
                className={v.portrait === p.portrait ? 'selected' : ''}
                aria-pressed={v.portrait === p.portrait}
                onClick={() => set('portrait', p.portrait)}
              >
                <Portrait index={p.portrait} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="form-grid">
        <Field label="Name">
          <input
            value={v.name}
            onChange={(e) => set('name', e.target.value)}
            maxLength={50}
            required
          />
        </Field>
        <Field label="Species or type">
          {campaign.state.settings.customization === 'standard' ? (
            <select
              value={v.ancestry}
              onChange={(e) => set('ancestry', e.target.value)}
            >
              {['Human', 'Elf', 'Dwarf', 'Halfling', 'Android'].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          ) : (
            <input
              value={v.ancestry}
              onChange={(e) => set('ancestry', e.target.value)}
              maxLength={60}
              required
            />
          )}
        </Field>
      </div>
      <Field label="Who are you?">
        <textarea
          value={v.concept}
          onChange={(e) => set('concept', e.target.value)}
          placeholder="Your appearance, motivation, and connection to the party"
          maxLength={1000}
          rows={3}
          required
        />
      </Field>
      <Field
        label={
          mode === 'Full builder' ? 'Role' : 'What do you want to be good at?'
        }
      >
        <select value={v.role} onChange={(e) => set('role', e.target.value)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r} ·{' '}
              {r === 'Vanguard'
                ? 'Protecting & fighting'
                : r === 'Wayfinder'
                  ? 'Exploring & ranged attacks'
                  : r === 'Arcanist'
                    ? 'Knowledge & special powers'
                    : 'Negotiating & investigating'}
            </option>
          ))}
        </select>
      </Field>
      {mode === 'Full builder' && (
        <div className="stat-builder">
          {Object.entries(v.stats).map(([key, n]) => (
            <Field key={key} label={key}>
              <select
                value={n}
                onChange={(e) =>
                  assign(key as keyof Stats, Number(e.target.value))
                }
              >
                {[15, 14, 13, 12, 10, 8].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      )}
      <p className="muted">
        Your concept is freeform; abilities use your selected role. Your DM can
        describe setting-appropriate equivalents for magic and equipment.
      </p>
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={v.absenceConsent}
          onChange={(e) => set('absenceConsent', e.target.checked)}
        />
        Allow my character to defend if I miss a timed combat turn.
      </label>
      <button className="primary full" disabled={busy}>
        Join the adventure <ArrowRight size={17} />
      </button>
    </form>
  );
}
function CharacterSheet({
  customAllowed,
  advancementBlocked,
  upload,
  character: c,
  own,
  post,
  busy,
}: {
  upload: (file: File) => Promise<boolean>;
  customAllowed: boolean;
  advancementBlocked: boolean;
  character?: Character;
  own: boolean;
  post: Post;
  busy: boolean;
}) {
  const [tab, setTab] = useState('Abilities');
  const [notes, setNotes] = useState(c?.notes || '');
  const [dmNotes, setDmNotes] = useState(c?.dmNotes || '');
  const [consent, setConsent] = useState(c?.absenceConsent || false);
  const [hostConsent, setHostConsent] = useState(
    c?.hostDefenseConsent || false,
  );
  if (!c) return <Empty>No character yet.</Empty>;
  return (
    <>
      <div className="character-preview">
        <Portrait src={c.portraitUrl} index={c.portrait} large />
        <div>
          <h2>{c.name}</h2>
          <p>
            {c.ancestry} · {c.role}
          </p>
          <p className="muted">
            Level {c.level} · {c.xp} experience
          </p>
        </div>
      </div>
      <p>{c.concept}</p>
      <div className="resources">
        <span>
          <Heart size={17} />
          {c.hp} / {c.maxHp}
        </span>
        <span>
          <Shield size={17} />
          {c.armor} armor
        </span>
        <span>
          <Sparkles size={17} />
          {c.energy} / {c.maxEnergy} energy
        </span>
      </div>
      <div className="subtabs">
        {['Abilities', 'Inventory', ...(own ? ['Profile', 'Notes'] : [])].map(
          (t) => (
            <button
              key={t}
              className={tab === t ? 'active' : ''}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ),
        )}
      </div>
      {tab === 'Abilities' && (
        <>
          {c.level < MAX_LEVEL ? (
            <p className="muted">
              {Math.max(0, nextLevelXp(c.level) - c.xp)} experience until level{' '}
              {c.level + 1}.
            </p>
          ) : (
            <p className="muted">Maximum level reached.</p>
          )}
          {own && c.level < MAX_LEVEL && c.xp >= nextLevelXp(c.level) && (
            <fieldset disabled={busy || advancementBlocked || c.hp <= 0}>
              <legend>Advance to level {c.level + 1}</legend>
              <p>
                Choose a permanent improvement. Current health and energy stay
                the same until you recover.
              </p>
              {advancementBlocked && (
                <p className="muted">
                  Finish the party’s current encounter, decision, and pending
                  actions first.
                </p>
              )}
              {c.hp <= 0 && <p className="muted">Recover before advancing.</p>}
              <button
                type="button"
                onClick={() => post({ op: 'levelUp', growth: 'vitality' })}
              >
                Vitality · +4 maximum health
              </button>
              <button
                type="button"
                onClick={() => post({ op: 'levelUp', growth: 'focus' })}
              >
                Focus · +1 maximum energy
              </button>
            </fieldset>
          )}
          <CustomAbilities
            character={c}
            own={own}
            enabled={customAllowed}
            busy={busy || advancementBlocked}
            post={post}
          />
          <dl className="stats">
            {Object.entries(c.stats).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>
                  {v}
                  <span>
                    {Math.floor((v - 10) / 2) >= 0 ? '+' : ''}
                    {Math.floor((v - 10) / 2)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="muted">
            Attack: 5 damage. Power: 8 damage, costs 1 energy. Defend: +3 armor
            for a round. Healing kit: restores up to 8 health.
          </p>
        </>
      )}
      {tab === 'Abilities' && own && (
        <BuildEditor
          key={`${c.id}:${c.role}:${JSON.stringify(c.stats)}`}
          character={c}
          post={post}
          busy={busy}
          blocked={advancementBlocked}
        />
      )}
      {tab === 'Profile' && own && (
        <ProfileEditor character={c} post={post} busy={busy} upload={upload} />
      )}
      {tab === 'Inventory' && (
        <ul className="inventory">
          {c.inventory.map((item, i) => (
            <li key={`${item}-${i}`}>{item}</li>
          ))}
        </ul>
      )}
      {tab === 'Notes' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await post({
              op: 'notes',
              notes,
              dmNotes,
              absenceConsent: consent,
              hostDefenseConsent: hostConsent,
            });
          }}
        >
          <Field label="Only you can see these notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={4000}
            />
          </Field>
          <Field label="Shared with your DM">
            <textarea
              value={dmNotes}
              onChange={(e) => setDmNotes(e.target.value)}
              rows={3}
              maxLength={4000}
            />
          </Field>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Allow timed defensive actions while absent
          </label>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={hostConsent}
              onChange={(e) => setHostConsent(e.target.checked)}
            />
            Allow the host to resolve my turn as defense in host-managed games
          </label>
          <button className="primary" disabled={busy}>
            Save notes & preference
          </button>
        </form>
      )}
    </>
  );
}
function JournalView({
  campaign,
  host,
  post,
}: {
  campaign: CampaignView;
  host: boolean;
  post: Post;
}) {
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState('');
  const entries = campaign.state.journal.filter(
    (j) => category === 'All' || j.category === category,
  );
  const entry = entries.find((j) => j.id === selected) || entries[0];
  return (
    <div className="secondary-page">
      <div className="page-heading">
        <h1>Campaign journal</h1>
        <BookOpen size={24} />
      </div>
      <div className="subtabs">
        {['All', 'Story', 'Quests', 'People', 'Discoveries'].map((c) => (
          <button
            key={c}
            className={category === c ? 'active' : ''}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="journal-layout">
        <aside>
          {entries.map((j) => (
            <button
              key={j.id}
              className={entry?.id === j.id ? 'selected' : ''}
              aria-pressed={entry?.id === j.id}
              onClick={() => setSelected(j.id)}
            >
              <span className="muted">
                {j.category}
                {j.completed ? ' · Complete' : ''}
              </span>
              <strong>{j.title}</strong>
            </button>
          ))}
          {!entries.length && <Empty>No entries in this section yet.</Empty>}
        </aside>
        {entry && (
          <article className="journal-entry">
            <span className="muted">{entry.category}</span>
            <h2>{entry.title}</h2>
            <p>{entry.body}</p>
            {host && entry.category === 'Quests' && (
              <button
                onClick={() =>
                  post({ op: 'dm', kind: 'completeQuest', entryId: entry.id })
                }
              >
                <Check size={16} />
                {entry.completed ? 'Reopen quest' : 'Mark complete'}
              </button>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
function Chat({
  campaign,
  post,
  busy,
  canSend,
}: {
  campaign: CampaignView;
  post: Post;
  busy: boolean;
  canSend: boolean;
}) {
  const [value, setValue] = useState('');
  const events = campaign.state.events.filter((e) => e.kind === 'chat');
  return (
    <>
      <p className="muted">
        Out-of-character conversation. This chat is not sent to the AI DM.
      </p>
      <div className="chat-history">
        {events.length ? (
          events.map((e) => (
            <article key={e.id}>
              <div className="event-meta">
                <strong>{e.author}</strong>
                <time>{stamp(e.at)}</time>
              </div>
              <p>{e.text}</p>
            </article>
          ))
        ) : (
          <Empty>Make a plan, ask a question, or say hello.</Empty>
        )}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await post({ op: 'chat', text: value })) setValue('');
        }}
      >
        <Field label="Message">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={2}
            maxLength={2000}
            required
            disabled={!canSend}
          />
        </Field>
        <button
          className="primary"
          disabled={busy || !canSend || !value.trim()}
        >
          Send message <Send size={16} />
        </button>
        {!canSend && <p>Create a character before chatting.</p>}
      </form>
    </>
  );
}
function WorldEditor({
  campaign,
  host,
  busy,
  onSave,
}: {
  campaign: CampaignView;
  host: boolean;
  busy: boolean;
  onSave: (world: {
    title: string;
    setting: string;
    premise: string;
  }) => Promise<void>;
}) {
  const { state } = campaign;
  const [title, setTitle] = useState(state.title);
  const [setting, setSetting] = useState(state.setting);
  const [premise, setPremise] = useState(state.premise);
  const blocked = !!(state.encounter || state.decision || state.pending.length);
  const changed =
    title.trim() !== state.title ||
    setting.trim() !== state.setting ||
    premise.trim() !== state.premise;
  return (
    <details>
      <summary>World and premise</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await onSave({ title, setting, premise });
        }}
      >
        <fieldset disabled={!host || busy || blocked}>
          <Field label="Campaign name">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              required
            />
          </Field>
          <Field label="World and era">
            <textarea
              value={setting}
              onChange={(event) => setSetting(event.target.value)}
              maxLength={1500}
              rows={3}
              required
            />
          </Field>
          <Field label="Premise">
            <textarea
              value={premise}
              onChange={(event) => setPremise(event.target.value)}
              maxLength={1500}
              rows={3}
              required
            />
          </Field>
          <p className="muted">
            These details guide future narration. Existing story events, journal
            entries, current location, and character progress are preserved.
          </p>
          {host && (
            <button className="primary" disabled={!changed}>
              Save world
            </button>
          )}
        </fieldset>
        {blocked && (
          <p className="muted">
            Finish the party’s current encounter, decision, and pending actions
            before changing the world.
          </p>
        )}
        {!host && (
          <p className="muted">The campaign host can edit these details.</p>
        )}
      </form>
    </details>
  );
}

function SettingsPanel({
  campaign,
  host,
  busy,
  onSave,
}: {
  campaign: CampaignView;
  host: boolean;
  busy: boolean;
  onSave: (v: Settings) => void;
}) {
  const [value, setValue] = useState({
    ...campaign.state.settings,
    ...campaign.state.pendingSettings,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value);
      }}
    >
      <p className="muted">
        {host
          ? 'Scheduling changes apply now. DM, rules, and voting changes wait until the current encounter, decision, and pending actions are finished.'
          : 'The campaign host manages these settings.'}
      </p>
      <SettingFields value={value} onChange={setValue} disabled={!host} />
      {campaign.state.pendingSettings && (
        <p className="waiting">
          Queued for after current play: {campaign.state.pendingSettings.dm} DM
          · {campaign.state.pendingSettings.rules} rules ·{' '}
          {campaign.state.pendingSettings.decision} decisions.
        </p>
      )}
      <p className="muted">
        Timed defense requires each player’s consent and is checked
        automatically while a player has the campaign open
        {__LANTERN_STANDALONE__ || __LANTERN_RAILWAY__
          ? ', and while everyone is away if background turns are enabled on this server'
          : ''}
        . Host-managed defense needs a separate opt-in in each character’s Notes
        tab. Party votes wait for the chosen agreement rule; their deadline is a
        reminder.
      </p>
      {host && (
        <button className="primary" disabled={busy}>
          Save settings
        </button>
      )}
    </form>
  );
}
function DecisionForm({
  onCreate,
  busy,
}: {
  onCreate: (v: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [question, setQuestion] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ question, options: [a, b] });
      }}
    >
      <Field label="What should the party decide?">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={300}
          required
        />
      </Field>
      <Field label="First option">
        <input
          value={a}
          onChange={(e) => setA(e.target.value)}
          maxLength={120}
          required
        />
      </Field>
      <Field label="Second option">
        <input
          value={b}
          onChange={(e) => setB(e.target.value)}
          maxLength={120}
          required
        />
      </Field>
      <button className="primary" disabled={busy}>
        Ask the party <Users size={17} />
      </button>
    </form>
  );
}
function PartyDecision({
  campaign,
  user,
  post,
  busy,
}: {
  campaign: CampaignView;
  user: User;
  post: Post;
  busy: boolean;
}) {
  const d = campaign.state.decision!;
  return (
    <section className="party-decision">
      <span className="muted">
        Party decision · {campaign.state.settings.decision}
      </span>
      <h2>{d.question}</h2>
      <div>
        {d.options.map((o, i) => (
          <button
            key={o}
            className={d.votes[user.id] === i ? 'selected' : ''}
            aria-pressed={d.votes[user.id] === i}
            disabled={busy}
            onClick={() => post({ op: 'vote', decisionId: d.id, option: i })}
          >
            {d.votes[user.id] === i && <Check size={16} />} {o}{' '}
            <span className="muted">
              {Object.values(d.votes).filter((v) => v === i).length}
            </span>
          </button>
        ))}
      </div>
      <p className="muted">
        {Object.keys(d.votes).length} of {campaign.state.characters.length}{' '}
        players have voted.
      </p>
      {campaign.hostId === user.id && (
        <button
          disabled={busy}
          onClick={() => post({ op: 'dm', kind: 'cancelDecision' })}
        >
          Cancel decision
        </button>
      )}
    </section>
  );
}
function Encounter({
  campaign,
  user,
  post,
  busy,
}: {
  campaign: CampaignView;
  user: User;
  post: Post;
  busy: boolean;
}) {
  const e = campaign.state.encounter!;
  const me = campaign.state.characters.find((c) => c.userId === user.id);
  const active = campaign.state.characters.find(
    (c) => c.id === e.order[e.index],
  );
  const [target, setTarget] = useState('');
  const [move, setMove] = useState(false);
  const mine = me?.id === active?.id;
  const living = e.enemies.filter((n) => n.hp > 0);
  const selected = living.find((n) => n.id === target) || living[0];
  const expired = !!e.deadline;
  return (
    <section className="encounter">
      <div className="encounter-heading">
        <div>
          <span className="muted">Round {e.round}</span>
          <h2>{mine ? 'Your turn' : `${active?.name}'s turn`}</h2>
        </div>
        <Swords size={25} />
      </div>
      <div className="turn-order">
        {e.order.map((id) => {
          const c = campaign.state.characters.find((c) => c.id === id);
          return c ? (
            <span className={active?.id === id ? 'active' : ''} key={id}>
              {c.name} · {c.hp} HP
            </span>
          ) : null;
        })}
      </div>
      <fieldset className="battle-grid" aria-label="Encounter grid">
        {Array.from({ length: 64 }, (_, i) => {
          const x = i % 8,
            y = Math.floor(i / 8);
          const c = campaign.state.characters.find(
            (c) => c.x === x && c.y === y && c.hp > 0,
          );
          const n = living.find((n) => n.x === x && n.y === y);
          return (
            <button
              key={i}
              className={`${c ? 'ally' : ''} ${n ? 'enemy' : ''} ${n?.id === selected?.id ? 'target' : ''}`}
              aria-pressed={n ? n.id === selected?.id : undefined}
              aria-label={`Tile ${x + 1}, ${y + 1}${c ? `, ${c.name}` : n ? `, ${n.name}, ${n.hp} health` : ''}`}
              onClick={() => {
                if (n) setTarget(n.id);
                else if (move && mine) {
                  void post({ op: 'combat', action: 'move', x, y });
                  setMove(false);
                }
              }}
            >
              {c ? (
                <Portrait src={c.portraitUrl} index={c.portrait} />
              ) : n ? (
                <>
                  <Swords size={20} />
                  <small>{n.hp}</small>
                </>
              ) : null}
            </button>
          );
        })}
      </fieldset>
      <p className="muted">
        {move
          ? 'Choose a free tile within 3 spaces. Moving uses your turn.'
          : `Target: ${selected?.name || 'none'} · ${selected?.hp || 0} health. Select an enemy to change target.`}
      </p>
      <div className="combat-actions">
        <button
          disabled={!mine || busy}
          onClick={() =>
            post({ op: 'combat', action: 'attack', target: selected?.id })
          }
        >
          <Swords size={16} />
          Attack
        </button>
        <button
          disabled={!mine || busy || !me?.energy}
          onClick={() =>
            post({ op: 'combat', action: 'power', target: selected?.id })
          }
        >
          <Sparkles size={16} />
          Power
        </button>
        <button
          disabled={!mine || busy}
          onClick={() => post({ op: 'combat', action: 'defend' })}
        >
          <Shield size={16} />
          Defend
        </button>
        <button
          disabled={!mine || busy}
          onClick={() => setMove(!move)}
          className={move ? 'selected' : ''}
          aria-pressed={move}
        >
          <MapPin size={16} />
          Move
        </button>
        <button
          disabled={!mine || busy || !me?.inventory.includes('Healing kit')}
          onClick={() => post({ op: 'combat', action: 'heal' })}
        >
          <Heart size={16} />
          Heal
        </button>
      </div>
      {!!me?.abilities?.some((a) => a.approved) && (
        <div className="combat-actions" aria-label="Custom abilities">
          {me.abilities
            .filter((a) => a.approved)
            .map((a) => (
              <button
                key={a.id}
                disabled={
                  !mine ||
                  busy ||
                  !me.energy ||
                  (a.effect === 'mend' && me.hp >= me.maxHp)
                }
                title={ABILITY_EFFECTS[a.effect]}
                onClick={() =>
                  post({
                    op: 'combat',
                    action: 'ability',
                    abilityId: a.id,
                    target: selected?.id,
                  })
                }
              >
                {a.name} · 1 energy
              </button>
            ))}
        </div>
      )}
      {campaign.state.settings.pace === 'host' &&
        campaign.hostId === user.id && (
          <div>
            <button
              disabled={
                busy ||
                campaign.state.settings.absence !== 'defend' ||
                !active?.hostDefenseConsent
              }
              onClick={() => post({ op: 'hostDefend' })}
            >
              Resolve {active?.name}’s turn as defense
            </button>
            <p className="muted">
              {campaign.state.settings.absence !== 'defend'
                ? 'Enable defensive absence actions in settings to use this control.'
                : !active?.hostDefenseConsent
                  ? 'This player must allow host-managed defense in their character’s Notes tab first.'
                  : 'This uses the player’s turn and may start the enemy phase.'}
            </p>
          </div>
        )}
      {e.deadline && (
        <p className="muted">
          Turn due {new Date(e.deadline).toLocaleString()}.{' '}
          {expired && (
            <button onClick={() => post({ op: 'tick' })} disabled={busy}>
              Check absence policy
            </button>
          )}
        </p>
      )}
    </section>
  );
}
function DMDesk({
  campaign,
  post,
  busy,
  setError,
}: {
  campaign: CampaignView;
  post: Post;
  busy: boolean;
  setError: (s: string) => void;
}) {
  const [value, setValue] = useState('');
  const [pendingId, setPendingId] = useState('');
  const [notes, setNotes] = useState(campaign.state.dmNotes);
  const [enemy, setEnemy] = useState('Harbor raider');
  const [count, setCount] = useState(2);
  const [location, setLocation] = useState('');
  const [journalTitle, setJournalTitle] = useState('');
  const [journalBody, setJournalBody] = useState('');
  const [category, setCategory] = useState<Journal['category']>('Quests');
  const [drafting, setDrafting] = useState(false);
  const [aiDraft, setAiDraft] = useState<{
    narrative: string;
    pendingId: string;
  } | null>(null);
  return (
    <div className="secondary-page dm-desk">
      <div className="page-heading">
        <div>
          <h1>DM Desk</h1>
          <p className="muted">
            Only you can see this workspace. Published narration is shared with
            the party.
          </p>
        </div>
      </div>
      {campaign.state.characters.some((c) => c.abilities?.length) && (
        <section>
          <h2>Custom abilities</h2>
          {campaign.state.characters.flatMap((c) =>
            (c.abilities || []).map((a) => (
              <div key={a.id} className="journal-entry">
                <h3>
                  {c.name} · {a.name}
                </h3>
                <p>{a.description}</p>
                <p className="muted">
                  {ABILITY_EFFECTS[a.effect]}{' '}
                  {a.approved ? 'Approved.' : 'Awaiting review.'}
                </p>
                <fieldset
                  disabled={
                    busy ||
                    !!campaign.state.encounter ||
                    !!campaign.state.decision ||
                    !!campaign.state.pending.length
                  }
                >
                  {!a.approved && (
                    <button
                      disabled={
                        campaign.state.settings.customization !== 'custom'
                      }
                      onClick={() =>
                        post({
                          op: 'reviewAbility',
                          characterId: c.id,
                          abilityId: a.id,
                          approve: true,
                        })
                      }
                    >
                      Approve
                    </button>
                  )}
                  <button
                    onClick={() =>
                      post({
                        op: 'reviewAbility',
                        characterId: c.id,
                        abilityId: a.id,
                        approve: false,
                      })
                    }
                  >
                    {a.approved ? 'Revoke' : 'Decline'}
                  </button>
                </fieldset>
              </div>
            )),
          )}
        </section>
      )}
      <div className="dm-columns">
        <div>
          <section>
            <h2>Waiting on you</h2>
            {campaign.state.pending.length ? (
              campaign.state.pending.map((p) => (
                <button
                  key={p.id}
                  className={`pending-row ${pendingId === p.id ? 'selected' : ''}`}
                  aria-pressed={pendingId === p.id}
                  disabled={drafting}
                  onClick={() => {
                    setPendingId(p.id);
                    setAiDraft(null);
                  }}
                >
                  <strong>{p.author}</strong>
                  <span>{p.text}</span>
                  <span className="muted">{p.roll}</span>
                </button>
              ))
            ) : (
              <Empty>No pending player actions.</Empty>
            )}
          </section>
          <section>
            <h2>Speak to the party</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await post({
                    op: 'dm',
                    kind: 'narrate',
                    text: value,
                    pendingId,
                  })
                ) {
                  setValue('');
                  setPendingId('');
                  setAiDraft(null);
                }
              }}
            >
              <Field label="Narration">
                <textarea
                  rows={6}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  maxLength={6000}
                  required
                  placeholder="What happens next?"
                />
              </Field>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy || drafting || !value.trim()}
                >
                  Publish narration <Send size={16} />
                </button>
                {campaign.state.settings.dm === 'assisted' && (
                  <button
                    type="button"
                    aria-describedby="ai-draft-guidance"
                    disabled={
                      busy ||
                      drafting ||
                      !campaign.state.pending.some((p) => p.id === pendingId)
                    }
                    onClick={async () => {
                      setDrafting(true);
                      try {
                        const d = await request<{
                          narrative: string;
                          pendingId: string;
                        }>('', {
                          op: 'draft',
                          id: campaign.id,
                          pendingId,
                        });
                        setAiDraft(d);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setDrafting(false);
                      }
                    }}
                  >
                    <Sparkles size={16} />
                    {drafting ? 'Drafting…' : 'Draft with AI'}
                  </button>
                )}
              </div>
              {campaign.state.settings.dm === 'assisted' && (
                <p id="ai-draft-guidance" className="muted">
                  {campaign.state.pending.length === 0
                    ? 'AI drafts respond to player actions. A player needs to submit an action first.'
                    : !campaign.state.pending.some((p) => p.id === pendingId)
                      ? 'Select a player action under Waiting on you to draft a response with AI.'
                      : 'The AI draft will appear separately for you to review before publishing.'}
                </p>
              )}
              {aiDraft && (
                <section aria-label="AI draft preview">
                  <h3>AI draft · not shared</h3>
                  <p>{aiDraft.narrative}</p>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      aiDraft.pendingId !== pendingId ||
                      !campaign.state.pending.some(
                        (p) => p.id === aiDraft.pendingId,
                      )
                    }
                    onClick={() => {
                      setValue(aiDraft.narrative);
                      setAiDraft(null);
                    }}
                  >
                    Use draft in editor
                  </button>
                  <button type="button" onClick={() => setAiDraft(null)}>
                    Discard draft
                  </button>
                  <p className="muted">
                    Review and edit this text before publishing. Using the draft
                    replaces the editor text; it does not resolve the player’s
                    action.
                  </p>
                </section>
              )}
              {pendingId && (
                <p className="muted">
                  Publishing will resolve the selected player action.
                </p>
              )}
            </form>
          </section>
          <section>
            <h2>Private campaign notes</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void post({ op: 'dm', kind: 'notes', text: notes });
              }}
            >
              <Field label="Secrets and plans">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  maxLength={8000}
                />
              </Field>
              <button disabled={busy}>Save private notes</button>
            </form>
            {campaign.state.characters
              .filter((c) => c.dmNotes)
              .map((c) => (
                <div key={c.id}>
                  <h3>{c.name} shared with you</h3>
                  <p>{c.dmNotes}</p>
                </div>
              ))}
          </section>
        </div>
        <div>
          <section>
            <h2>Run an encounter</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void post({ op: 'dm', kind: 'encounter', name: enemy, count });
              }}
            >
              <Field label="Enemy name">
                <input
                  value={enemy}
                  onChange={(e) => setEnemy(e.target.value)}
                  maxLength={60}
                  required
                />
              </Field>
              <Field label="Number of enemies">
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </Field>
              <button disabled={busy || !!campaign.state.encounter}>
                <Swords size={16} />
                Start encounter
              </button>
            </form>
          </section>
          <section>
            <h2>Move the party</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await post({ op: 'dm', kind: 'location', text: location }))
                  setLocation('');
              }}
            >
              <Field label="New location">
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={80}
                  required
                />
              </Field>
              <button disabled={busy}>
                Travel together <ArrowRight size={16} />
              </button>
            </form>
          </section>
          <section>
            <h2>Add to the journal</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await post({
                    op: 'dm',
                    kind: 'journal',
                    title: journalTitle,
                    text: journalBody,
                    category,
                  })
                ) {
                  setJournalTitle('');
                  setJournalBody('');
                }
              }}
            >
              <Field label="Section">
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as Journal['category'])
                  }
                >
                  {['Story', 'Quests', 'People', 'Discoveries'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Title">
                <input
                  value={journalTitle}
                  onChange={(e) => setJournalTitle(e.target.value)}
                  maxLength={100}
                  required
                />
              </Field>
              <Field label="Entry">
                <textarea
                  value={journalBody}
                  onChange={(e) => setJournalBody(e.target.value)}
                  maxLength={4000}
                  rows={3}
                  required
                />
              </Field>
              <button disabled={busy}>Add entry</button>
            </form>
          </section>
          <section>
            <h2>Rest & recovery</h2>
            <p className="muted">
              Restore the party’s health and energy after a safe rest.
            </p>
            <button
              disabled={busy || !!campaign.state.encounter}
              onClick={() => post({ op: 'dm', kind: 'rest' })}
            >
              <Heart size={16} />
              Allow a rest
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function BuildEditor({
  character: c,
  post,
  busy,
  blocked,
}: {
  character: Character;
  post: Post;
  busy: boolean;
  blocked: boolean;
}) {
  const [role, setRole] = useState(c.role);
  const [stats, setStats] = useState(c.stats);
  const changed =
    role !== c.role ||
    Object.keys(stats).some(
      (key) => stats[key as keyof Stats] !== c.stats[key as keyof Stats],
    );
  const maxHp = c.maxHp - roleHealth(c.role) + roleHealth(role);
  return (
    <details>
      <summary>Change role and attributes</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await post({ op: 'rebuild', role, stats });
        }}
      >
        <fieldset disabled={busy || blocked || c.hp <= 0}>
          <legend>Character build</legend>
          <Field label="Role">
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {ROLES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <div className="stat-builder">
            {Object.entries(stats).map(([key, value]) => (
              <Field key={key} label={key}>
                <select
                  value={value}
                  onChange={(event) => {
                    const selected = Number(event.target.value);
                    const other = (Object.keys(stats) as (keyof Stats)[]).find(
                      (name) => name !== key && stats[name] === selected,
                    );
                    setStats({
                      ...stats,
                      [key]: selected,
                      ...(other ? { [other]: value } : {}),
                    });
                  }}
                >
                  {[15, 14, 13, 12, 10, 8].map((score) => (
                    <option key={score}>{score}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <p>
            After saving: {Math.min(c.hp, maxHp)} / {maxHp} health ·{' '}
            {roleArmor(role)} armor. Energy stays {c.energy} / {c.maxEnergy}.
          </p>
          <p className="muted">
            Changing a score swaps it with the attribute using that score.
            Level, experience, equipment, approved abilities, and earned
            capacity remain yours. Health above the new limit is lost; changing
            back does not restore it.
          </p>
          <button className="primary" disabled={!changed}>
            Save build
          </button>
        </fieldset>
        {blocked && (
          <p className="muted">
            Finish the party’s current encounter, decision, and pending actions
            first.
          </p>
        )}
        {c.hp <= 0 && (
          <p className="muted">Recover before changing your build.</p>
        )}
      </form>
    </details>
  );
}

function ProfileEditor({
  upload,
  character: c,
  post,
  busy,
}: {
  upload: (file: File) => Promise<boolean>;
  character: Character;
  post: Post;
  busy: boolean;
}) {
  const [name, setName] = useState(c.name);
  const [ancestry, setAncestry] = useState(c.ancestry);
  const [concept, setConcept] = useState(c.concept);
  const [portrait, setPortrait] = useState(c.portrait);
  const [saved, setSaved] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(false);
        if (await post({ op: 'profile', name, ancestry, concept, portrait }))
          setSaved(true);
      }}
    >
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          required
        />
      </Field>
      <Field label="Species or type">
        <input
          value={ancestry}
          onChange={(e) => setAncestry(e.target.value)}
          maxLength={60}
          required
        />
      </Field>
      <Field label="Appearance and story">
        <textarea
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          maxLength={1000}
          rows={4}
          required
        />
      </Field>
      <div className="portrait-picker">
        {PRESETS.map((p) => (
          <button
            type="button"
            key={p.portrait}
            aria-label={`Select portrait ${p.portrait + 1}`}
            className={portrait === p.portrait ? 'selected' : ''}
            aria-pressed={portrait === p.portrait}
            onClick={() => setPortrait(p.portrait)}
          >
            <Portrait index={p.portrait} />
          </button>
        ))}
      </div>
      <Field label="Your own artwork">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            const selected = e.target.files?.[0];
            setUploadError('');
            setFile(null);
            if (selected && selected.size > 512 * 1024)
              setUploadError('Choose an image smaller than 512 KB.');
            else setFile(selected || null);
          }}
        />
      </Field>
      <p className="muted">
        JPG, PNG, or still WebP. Up to 512 KB and 2048 pixels. Visible only to
        your campaign.
      </p>
      {uploadError && <p role="alert">{uploadError}</p>}
      {file && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (await upload(file)) {
              setFile(null);
              setSaved(true);
            }
          }}
        >
          Use this artwork
        </button>
      )}
      {c.portraitAsset && (
        <button
          type="button"
          disabled={busy}
          onClick={() => post({ op: 'clearPortrait' })}
        >
          Use preset portrait
        </button>
      )}
      <p className="muted">
        Appearance and identity changes preserve your abilities, equipment, and
        resources.
      </p>
      <button className="primary" disabled={busy}>
        Save character
      </button>
      {saved && <output className="muted"> Saved.</output>}
    </form>
  );
}

function CustomAbilities({
  character: c,
  own,
  enabled,
  busy,
  post,
}: {
  character: Character;
  own: boolean;
  enabled: boolean;
  busy: boolean;
  post: Post;
}) {
  const [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [effect, setEffect] = useState<'strike' | 'mend'>('strike');
  return (
    <section>
      {(c.abilities || []).map((a) => (
        <div key={a.id}>
          <h3>{a.name}</h3>
          <p>{a.description}</p>
          <p className="muted">
            {ABILITY_EFFECTS[a.effect]}{' '}
            {a.approved ? 'Approved.' : 'Waiting for host approval.'}
          </p>
          {own && (
            <button
              disabled={busy}
              onClick={() => post({ op: 'removeAbility', abilityId: a.id })}
            >
              Remove {a.name}
            </button>
          )}
        </div>
      ))}
      {own && enabled && (c.abilities?.length || 0) < 3 && (
        <details>
          <summary>Propose an ability</summary>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await post({ op: 'proposeAbility', name, description, effect })
              ) {
                setName('');
                setDescription('');
              }
            }}
          >
            <Field label="Ability name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                required
                placeholder="Healing light, repair nanites…"
              />
            </Field>
            <Field label="What does it look like?">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                required
              />
            </Field>
            <Field label="Game effect">
              <select
                value={effect}
                onChange={(e) => setEffect(e.target.value as 'strike' | 'mend')}
              >
                <option value="strike">Strike · 8 damage, 1 energy</option>
                <option value="mend">Mend · recover 6 health, 1 energy</option>
              </select>
            </Field>
            <p className="muted">
              {ABILITY_EFFECTS[effect]} Your description sets its appearance. It
              cannot add effects. The host reviews every proposal, including in
              AI-led games.
            </p>
            <button disabled={busy}>Send to host</button>
          </form>
        </details>
      )}
    </section>
  );
}

function SceneArtwork({
  campaign,
  busy,
  upload,
  post,
}: {
  campaign: CampaignView;
  busy: boolean;
  upload: (file: File) => Promise<boolean>;
  post: Post;
}) {
  const [file, setFile] = useState<File | null>(null),
    [error, setError] = useState('');
  return (
    <details>
      <summary>Scene artwork</summary>
      <p className="muted">
        Give this world its own backdrop. Use a landscape JPG, PNG, or still
        WebP up to 512 KB and 2048 pixels per side. Only campaign members can
        view it.
      </p>
      <Field label="Scene image">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            setError('');
            setFile(null);
            if (f && f.size > 512 * 1024)
              setError('Choose an image smaller than 512 KB.');
            else setFile(f || null);
          }}
        />
      </Field>
      {error && <p role="alert">{error}</p>}
      {file && (
        <button
          disabled={busy}
          onClick={async () => {
            if (await upload(file)) setFile(null);
          }}
        >
          Use this scene
        </button>
      )}
      {campaign.state.sceneAsset && (
        <button disabled={busy} onClick={() => post({ op: 'clearScene' })}>
          Restore default backdrop
        </button>
      )}
      <p className="muted">
        Artwork changes the view only. Update it when the party moves; it does
        not change the location or reveal discoveries.
      </p>
    </details>
  );
}
