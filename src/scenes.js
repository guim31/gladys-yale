// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`), registered per key by src/app.js.
// Scene triggers need no handler: the hub fires them (src/hub.js TRIGGERS).
//
//   lock_door   — lock a Yale lock. Output: the state it reached.
//   unlock_door — unlock it, only when the configuration allows unlocking
//                 from Gladys (off by default); refused otherwise.
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async lock_door(hub, { fields = {} }) {
    const { state } = await hub.operate(fields.lock || null, 'lock', 'scene');
    return { state };
  },

  async unlock_door(hub, { fields = {} }) {
    const { state } = await hub.operate(fields.lock || null, 'unlock', 'scene');
    return { state };
  },
};
