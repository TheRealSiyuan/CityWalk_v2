import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../src/config';

interface FakeRoom {
  onPeerJoin: ((id: string) => void) | null;
  onPeerLeave: ((id: string) => void) | null;
  actions: Map<string, { send: ReturnType<typeof vi.fn>; onMessage: ((d: unknown, ctx: { peerId: string }) => void) | null }>;
  connections: Record<string, { close: ReturnType<typeof vi.fn> }>;
  leave: ReturnType<typeof vi.fn>;
  getPeers(): Record<string, { close: ReturnType<typeof vi.fn> }>;
  makeAction(name: string): { send: ReturnType<typeof vi.fn>; onMessage: ((d: unknown, ctx: { peerId: string }) => void) | null };
}

const rooms: FakeRoom[] = [];

vi.mock('trystero', () => ({
  selfId: 'me',
  joinRoom: () => {
    const room: FakeRoom = {
      onPeerJoin: null,
      onPeerLeave: null,
      actions: new Map(),
      connections: {},
      leave: vi.fn(() => Promise.resolve()),
      getPeers() {
        return this.connections;
      },
      makeAction(name) {
        const action = { send: vi.fn(() => Promise.resolve()), onMessage: null };
        this.actions.set(name, action);
        return action;
      },
    };
    rooms.push(room);
    return room;
  },
}));

const { Net, isRemoteCloseLog, remoteCloseCount } = await import('../src/net');

function setup() {
  const onLeave = vi.fn();
  const net = new Net({ onJoin: vi.fn(), onLeave, onName: vi.fn() });
  net.start('room', 'Me', null);
  const room = rooms[rooms.length - 1];
  return { net, room, onLeave };
}

function peerJoins(room: FakeRoom, id: string) {
  room.connections[id] = { close: vi.fn() };
  room.onPeerJoin?.(id);
  return room.connections[id];
}

describe('Net: peers stuck after a re-join', () => {
  beforeEach(() => {
    rooms.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal('window', { setInterval: (f: () => void, ms: number) => setInterval(f, ms) });
    vi.stubGlobal('document', { hidden: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('closes the connection of a peer that never says anything', () => {
    const { net, room, onLeave } = setup();
    const conn = peerJoins(room, 'silent');
    vi.advanceTimersByTime((CONFIG.net.helloTimeout - 2) * 1000);
    expect(conn.close).not.toHaveBeenCalled();
    expect(net.peers.size).toBe(1);
    vi.advanceTimersByTime(4000);
    expect(conn.close).toHaveBeenCalledTimes(1);
    expect(net.peers.size).toBe(0);
    expect(onLeave).toHaveBeenCalledWith('silent');
  });

  it('keeps a peer that said hello, however long it then stays quiet (background tab)', () => {
    const { net, room, onLeave } = setup();
    const conn = peerJoins(room, 'friend');
    room.actions.get('hi')?.onMessage?.({ name: 'Ada' }, { peerId: 'friend' });
    vi.advanceTimersByTime(CONFIG.net.helloTimeout * 5 * 1000);
    expect(conn.close).not.toHaveBeenCalled();
    expect(net.peers.get('friend')?.name).toBe('Ada');
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('counts a state message as hearing from the peer', () => {
    const { net, room } = setup();
    const conn = peerJoins(room, 'friend');
    room.actions.get('st')?.onMessage?.(new Float32Array(10), { peerId: 'friend' });
    vi.advanceTimersByTime(CONFIG.net.helloTimeout * 5 * 1000);
    expect(conn.close).not.toHaveBeenCalled();
    expect(net.peers.size).toBe(1);
  });

  it('drops only the silent peer when others are fine', () => {
    const { net, room } = setup();
    peerJoins(room, 'friend');
    room.actions.get('hi')?.onMessage?.({ name: 'Ada' }, { peerId: 'friend' });
    const silent = peerJoins(room, 'silent');
    vi.advanceTimersByTime((CONFIG.net.helloTimeout + 2) * 1000);
    expect(silent.close).toHaveBeenCalledTimes(1);
    expect([...net.peers.keys()]).toEqual(['friend']);
    expect(rooms).toHaveLength(1);
  });

  it('ignores a peer that connects to a room being left, and re-joins when alone', async () => {
    const { net, room } = setup();
    // Alone long enough to trigger the first re-join; its leave() is still pending.
    let finishLeave: () => void = () => {};
    room.leave.mockReturnValue(new Promise<void>((res) => (finishLeave = res)));
    vi.advanceTimersByTime(20_000);
    expect(room.leave).toHaveBeenCalledTimes(1);
    peerJoins(room, 'late');
    expect(net.peers.size).toBe(0);
    finishLeave();
    await vi.advanceTimersByTimeAsync(0);
    expect(rooms).toHaveLength(2);
    peerJoins(rooms[1], 'late');
    expect(net.peers.size).toBe(1);
  });

  it('re-joins straight away after dropping a stuck peer, instead of waiting out the back-off', async () => {
    const { net, room } = setup();
    peerJoins(room, 'stuck');
    // Dropped on the first 2 s tick after helloTimeout; the re-join must follow on that same tick.
    await vi.advanceTimersByTimeAsync((CONFIG.net.helloTimeout + 2) * 1000);
    expect(net.peers.size).toBe(0);
    expect(room.leave).toHaveBeenCalledTimes(1);
    expect(rooms).toHaveLength(2);
    // Then back to the normal back-off: no further re-join until 18 s after this one.
    await vi.advanceTimersByTimeAsync(14_000);
    expect(rooms).toHaveLength(2);
    // The friend now gets through on the fresh room.
    peerJoins(rooms[1], 'stuck');
    rooms[1].actions.get('hi')?.onMessage?.({ name: 'Ada' }, { peerId: 'stuck' });
    expect(net.peers.get('stuck')?.name).toBe('Ada');
  });

  it('does not re-join early when a stuck peer is dropped but a real friend stays', async () => {
    const { net, room } = setup();
    peerJoins(room, 'friend');
    room.actions.get('hi')?.onMessage?.({ name: 'Ada' }, { peerId: 'friend' });
    peerJoins(room, 'stuck');
    await vi.advanceTimersByTimeAsync((CONFIG.net.helloTimeout + 2) * 1000);
    expect([...net.peers.keys()]).toEqual(['friend']);
    // The friend then leaves normally: the usual 18 s back-off from the last join applies, not an instant re-join.
    room.onPeerLeave?.('friend');
    await vi.advanceTimersByTimeAsync(2000);
    expect(room.leave).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(room.leave).toHaveBeenCalledTimes(1);
    expect(rooms).toHaveLength(2);
  });
});

describe('Net: a friend closing the connection is not an error', () => {
  const abort = Object.assign(new Error('User-Initiated Abort, reason=Close called'), { name: 'OperationError' });

  it('recognises only the library log of a remote close', () => {
    expect(isRemoteCloseLog(['Trystero peer error:', abort])).toBe(true);
    expect(isRemoteCloseLog(['Trystero peer error:', String(abort)])).toBe(true);
    // other peer errors, other messages and a bare string stay errors
    expect(isRemoteCloseLog(['Trystero peer error:', new Error('failed to apply remote signal')])).toBe(false);
    expect(isRemoteCloseLog(['Trystero action handler error:', abort])).toBe(false);
    expect(isRemoteCloseLog(['peer error: User-Initiated Abort'])).toBe(false);
    expect(isRemoteCloseLog([abort])).toBe(false);
  });

  it('logs a remote close as debug once the game is online, and leaves every other error alone', () => {
    const seen: unknown[][] = [];
    const debugSeen: unknown[][] = [];
    const origError = console.error;
    const origDebug = console.debug;
    console.error = (...a: unknown[]) => void seen.push(a);
    console.debug = (...a: unknown[]) => void debugSeen.push(a);
    vi.stubGlobal('window', { setInterval: () => 0 });
    vi.stubGlobal('document', { hidden: false });
    try {
      new Net({ onJoin: vi.fn(), onLeave: vi.fn(), onName: vi.fn() }).start('room', 'Me', null);
      const before = remoteCloseCount();
      console.error('Trystero peer error:', abort);
      console.error('Trystero peer error:', new Error('failed to apply remote signal'));
      console.error('something else broke');
      expect(remoteCloseCount()).toBe(before + 1);
      expect(seen.map((a) => String(a[0]))).toEqual(['Trystero peer error:', 'something else broke']);
      expect(String(seen[0][1])).toContain('failed to apply remote signal');
      expect(debugSeen).toHaveLength(1);
    } finally {
      console.error = origError;
      console.debug = origDebug;
      vi.unstubAllGlobals();
    }
  });
});
