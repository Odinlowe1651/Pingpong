import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  Platform,
} from "react-native";

/* ---------------- Utilities (dados) ---------------- */
const roll = (sides) => Math.floor(Math.random() * sides) + 1;
const rollNdS = (n, s) => {
  let total = 0;
  const rolls = [];
  let crit = false;
  for (let i = 0; i < n; i++) {
    const r = roll(s);
    rolls.push(r);
    total += r;
    if (r === s) crit = true;
  }
  return { total, rolls, crit };
};

/* ---------------- HP Bar (animada) ---------------- */
const HPBar = ({ hp, maxHp }) => {
  const pct = Math.max(0, Math.min(1, hp / maxHp));
  const anim = useRef(new Animated.Value(pct)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const color = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["#EF4444", "#F59E0B", "#22C55E"],
  });

  return (
    <View style={styles.hpWrap}>
      <Animated.View style={[styles.hpFill, { width, backgroundColor: color }]} />
      <Text style={styles.hpText}>
        {Math.round(hp)}/{maxHp}
      </Text>
    </View>
  );
};

/* ---------------- Chip de efectos ---------------- */
const Chip = ({ text, tone = "buff" }) => (
  <View style={[styles.chip, tone === "debuff" ? styles.chipDebuff : styles.chipBuff]}>
    <Text style={styles.chipText}>{text}</Text>
  </View>
);

/* ---------------- Modelo de luchador ---------------- */
const mkFighter = (name, face) => ({
  name,
  face,
  hp: 100,
  maxHp: 100,
  effects: [], // { type: 'atk+2' | 'def+2' | 'def-2', turns: n }
});

/* ---------------- App principal ---------------- */
export default function App() {
  // estado jugadores
  const [p1, setP1] = useState(mkFighter("Jugador 1", "😎🥊"));
  const [p2, setP2] = useState(mkFighter("Jugador 2", "🤬🥊"));

  // turno: 1 => P1 es atacante, 2 => P2 es atacante
  const [turn, setTurn] = useState(1);

  // fase: 'buff' -> atacante puede tirar buff, 'attack' -> atacante lanza ataque, 'defense' -> defensor lanza defensa
  const [phase, setPhase] = useState("buff");

  // log de batalla
  const [log, setLog] = useState([]);

  // ataque pendiente: { attackerId, value: { total, rolls, crit } } or null
  const [pendingAtk, setPendingAtk] = useState(null);

  // control game over
  const [gameOver, setGameOver] = useState(false);

  const addLog = (line) => setLog((prev) => [line, ...prev].slice(0, 200));

  // calcular mods desde effects
  const modsFromEffects = (effects) => {
    let atk = 0;
    let def = 0;
    effects.forEach((e) => {
      if (e.type === "atk+2") atk += 2;
      if (e.type === "def+2") def += 2;
      if (e.type === "def-2") def -= 2;
    });
    return { atk, def };
  };

  // reduce duración de efectos y devuelve nuevo arreglo
  const tickDownEffects = (fighter) =>
    (fighter.effects || [])
      .map((e) => ({ ...e, turns: e.turns - 1 }))
      .filter((e) => e.turns > 0);

  /* ---------------- Buff/Debuff manual ---------------- */
  const doBuff = (id) => {
    if (gameOver) return;
    if (turn !== id) {
      addLog("No es tu turno para tirar buff.");
      return;
    }
    if (phase !== "buff") {
      addLog("No puedes tirar buff en esta fase.");
      return;
    }

    const bd = roll(6);
    let summary = "";
    // clonar para no mutar estados directo
    let A = id === 1 ? { ...p1 } : { ...p2 };
    let B = id === 1 ? { ...p2 } : { ...p1 };

    if (bd <= 2) {
      summary = "Sin efecto.";
    } else if (bd <= 4) {
      A.effects = [...A.effects, { type: "atk+2", turns: 3 }];
      summary = "+2 ATQ por 3 turnos.";
    } else if (bd === 5) {
      A.effects = [...A.effects, { type: "def+2", turns: 3 }];
      summary = "+2 DEF por 3 turnos.";
    } else {
      B.effects = [...B.effects, { type: "def-2", turns: 3 }];
      summary = "Rival -2 DEF por 3 turnos.";
    }

    addLog(`🎲 ${A.name} tira Buff (1d6=${bd}) → ${summary}`);

    if (id === 1) {
      setP1(A);
      setP2(B);
    } else {
      setP2(A);
      setP1(B);
    }

    // atacante puede optar a atacar en la misma fase (no forzamos cambio)
  };

  /* ---------------- Ataque manual ---------------- */
  const doAttack = (id) => {
    if (gameOver) return;
    if (turn !== id) {
      addLog("No es tu turno para atacar.");
      return;
    }
    if (phase !== "buff" && phase !== "attack") {
      addLog("No puedes atacar en esta fase.");
      return;
    }
    // realizar 2d6
    const atkRoll = rollNdS(2, 6);
    const attacker = id === 1 ? p1 : p2;
    const AMods = modsFromEffects(attacker.effects);
    const totalAtk = atkRoll.total + AMods.atk;
    const isCrit = atkRoll.crit || attacker.effects.some(e => e.type === 'crit'); // note: we didn't create 'crit' effect type here, but keep check

    addLog(`🧨 ${attacker.name} ataca: 2d6 (${atkRoll.rolls.join("+")}) +${AMods.atk} = ${totalAtk}${isCrit ? " 🔥 CRÍTICO?" : ""}`);

    // guardar ataque pendiente (defensor lo usará)
    setPendingAtk({ attackerId: id, value: { ...atkRoll, total: totalAtk, critical: atkRoll.crit } });

    // avanzar fase a defensa
    setPhase("defense");
  };

  /* ---------------- Defensa manual ---------------- */
  const doDefense = (id) => {
    if (gameOver) return;
    if (phase !== "defense") {
      addLog("No estás en fase de defensa.");
      return;
    }
    // defender debe ser el jugador que NO es atacante
    const defenderId = id;
    const attackerId = pendingAtk?.attackerId;
    if (!pendingAtk || attackerId == null) {
      addLog("No hay ataque pendiente.");
      return;
    }
    // defensor id must equal opposite of attacker
    if (defenderId === attackerId) {
      addLog("No puedes defender tu propio ataque.");
      return;
    }

    const defRoll = rollNdS(2, 6);
    const defender = defenderId === 1 ? p1 : p2;
    const attacker = attackerId === 1 ? p1 : p2;

    const DMods = modsFromEffects(defender.effects);
    const attackTotal = pendingAtk.value.total;
    const defenseTotal = defRoll.total + DMods.def;

    addLog(`🛡️ ${defender.name} defiende: 2d6 (${defRoll.rolls.join("+")}) +${DMods.def} = ${defenseTotal}`);

    // calcular daño
    let damage = 0;
    if (attackTotal > defenseTotal) {
      damage = attackTotal - defenseTotal;
      // crítico duplica daño
      if (pendingAtk.value.critical) {
        damage = damage * 2;
        addLog("💥 CRÍTICO! Daño duplicado.");
      }
    }

    // aplicar daño
    let newDef = { ...defender };
    newDef.hp = Math.max(0, newDef.hp - damage);

    if (damage > 0) {
      addLog(`🔥 ${attacker.name} inflige ${damage} a ${defender.name}`);
    } else {
      addLog("✅ ¡Defensa exitosa! No hay daño.");
    }

    // reducir turnos de efectos (ambos)
    const attNew = { ...attacker, effects: tickDownEffects(attacker) };
    const defNew = { ...newDef, effects: tickDownEffects(newDef) };

    // commit estados (según quien sea defensor)
    if (defenderId === 1) {
      setP1(defNew);
      setP2(attNew);
    } else {
      setP2(defNew);
      setP1(attNew);
    }

    setPendingAtk(null);
    setPhase("buff");
    setTurn(turn === 1 ? 2 : 1);

    // comprobar muerte
    if (defNew.hp <= 0) {
      setGameOver(true);
      addLog(`🏆 ¡${attacker.name} gana el combate!`);
    }
  };

  /* ---------------- Reset ---------------- */
  const reset = () => {
    setP1(mkFighter("Jugador 1", "😎🥊"));
    setP2(mkFighter("Jugador 2", "🤬🥊"));
    setTurn(1);
    setPhase("buff");
    setLog([]);
    setPendingAtk(null);
    setGameOver(false);
  };

  // derived modifiers for display
  const p1Mods = useMemo(() => modsFromEffects(p1.effects), [p1.effects]);
  const p2Mods = useMemo(() => modsFromEffects(p2.effects), [p2.effects]);

  /* ---------------- Render ---------------- */
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🥊 Duelos con Dados (Manual)</Text>

      {/* --- Jugador 1 (top, fijo) --- */}
      <View style={styles.fighterTop}>
        <Text style={styles.face}>{p1.face}</Text>
        <Text style={styles.fighterName}>{p1.name}</Text>
        <HPBar hp={p1.hp} maxHp={p1.maxHp} />
        <View style={styles.effectsRow}>
          {p1.effects.map((e, i) => (
            <Chip key={i} text={`${e.type} (${e.turns})`} tone={e.type === "def-2" ? "debuff" : "buff"} />
          ))}
        </View>
        <Text style={styles.mods}>ATQ: {p1Mods.atk >= 0 ? `+${p1Mods.atk}` : p1Mods.atk} · DEF: {p1Mods.def >= 0 ? `+${p1Mods.def}` : p1Mods.def}</Text>

        {/* controles P1 */}
        <View style={styles.playerControls}>
          <TouchableOpacity
            onPress={() => doBuff(1)}
            disabled={!(turn === 1 && phase === "buff") || gameOver}
            style={[styles.controlBtn, (turn === 1 && phase === "buff") ? styles.controlBtnActive : styles.controlBtnDisabled]}
          >
            <Text style={styles.controlText}>🎲 Buff 1d6</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => doAttack(1)}
            disabled={!(turn === 1 && (phase === "buff" || phase === "attack")) || gameOver || !!pendingAtk}
            style={[styles.controlBtn, (turn === 1) ? styles.attackBtnActive : styles.controlBtnDisabled]}
          >
            <Text style={styles.controlText}>🧨 Atacar 2d6</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => doDefense(1)}
            disabled={!(turn !== 1 && phase === "defense") || gameOver || !pendingAtk}
            style={[styles.controlBtn, (turn !== 1 && phase === "defense") ? styles.defendBtnActive : styles.controlBtnDisabled]}
          >
            <Text style={styles.controlText}>🛡️ Defender 2d6</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* --- Centro: turno / dados / log (scrollable) --- */}
      <View style={styles.centerArea}>
        <View style={styles.turnBanner}>
          <Text style={styles.turnText}>
            {gameOver ? "Fin del combate" : `Turno: ${turn === 1 ? p1.name : p2.name} · Fase: ${phase}`}
          </Text>
        </View>

        <View style={styles.diceRow}>
          <View style={styles.diceWrap}>
            <Text style={styles.diceLabel}>Buff</Text>
            <View style={styles.diceBox}>
              <Text style={styles.diceValue}>-</Text>
            </View>
          </View>

          <View style={styles.diceWrap}>
            <Text style={styles.diceLabel}>Ataque</Text>
            <View style={styles.diceBox}>
              <Text style={styles.diceValue}>{pendingAtk ? pendingAtk.value.total : "-"}</Text>
            </View>
          </View>

          <View style={styles.diceWrap}>
            <Text style={styles.diceLabel}>Defensa</Text>
            <View style={styles.diceBox}>
              <Text style={styles.diceValue}>-</Text>
            </View>
          </View>
        </View>

        <View style={styles.logBox}>
          <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
            {log.map((l, i) => (
              <Text key={i} style={styles.logLine}>
                {l}
              </Text>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* --- Jugador 2 (bottom, fijo) --- */}
      <View style={styles.fighterBottom}>
        <Text style={styles.face}>{p2.face}</Text>
        <Text style={styles.fighterName}>{p2.name}</Text>
        <HPBar hp={p2.hp} maxHp={p2.maxHp} />
        <View style={styles.effectsRow}>
          {p2.effects.map((e, i) => (
            <Chip key={i} text={`${e.type} (${e.turns})`} tone={e.type === "def-2" ? "debuff" : "buff"} />
          ))}
        </View>
        <Text style={styles.mods}>ATQ: {p2Mods.atk >= 0 ? `+${p2Mods.atk}` : p2Mods.atk} · DEF: {p2Mods.def >= 0 ? `+${p2Mods.def}` : p2Mods.def}</Text>

        {/* controles P2 */}
        <View style={styles.playerControls}>
          <TouchableOpacity
            onPress={() => doBuff(2)}
            disabled={!(turn === 2 && phase === "buff") || gameOver}
            style={[styles.controlBtn, (turn === 2 && phase === "buff") ? styles.controlBtnActive : styles.controlBtnDisabled]}
          >
            <Text style={styles.controlText}>🎲 Buff 1d6</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => doAttack(2)}
            disabled={!(turn === 2 && (phase === "buff" || phase === "attack")) || gameOver || !!pendingAtk}
            style={[styles.controlBtn, (turn === 2) ? styles.attackBtnActive : styles.controlBtnDisabled]}
          >
            <Text style={styles.controlText}>🧨 Atacar 2d6</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => doDefense(2)}
            disabled={!(turn !== 2 && phase === "defense") || gameOver || !pendingAtk}
            style={[styles.controlBtn, (turn !== 2 && phase === "defense") ? styles.defendBtnActive : styles.controlBtnDisabled]}
          >
            <Text style={styles.controlText}>🛡️ Defender 2d6</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* --- Footer / reset --- */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={reset} style={styles.resetBtn}>
          <Text style={styles.resetText}>🔄 Reiniciar</Text>
        </TouchableOpacity>
        <Text style={styles.footer}>{Platform.OS === "ios" ? "iOS" : "Android"} • RN puro</Text>
      </View>
    </View>
  );
}

/* ---------------- Estilos ---------------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1020",
    paddingTop: 18,
    paddingHorizontal: 10,
    justifyContent: "space-between",
  },
  title: {
    textAlign: "center",
    color: "#E6EEF8",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },

  /* fighter top / bottom */
  fighterTop: {
    alignItems: "center",
    paddingVertical: 8,
  },
  fighterBottom: {
    alignItems: "center",
    paddingVertical: 8,
  },

  face: {
    fontSize: 44,
    marginBottom: 6,
  },
  fighterName: {
    color: "#E5E7EB",
    fontWeight: "800",
    marginBottom: 6,
  },

  hpWrap: {
    width: 180,
    height: 18,
    backgroundColor: "#0f1724",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#13203d",
    overflow: "hidden",
    marginBottom: 6,
  },
  hpFill: {
    height: "100%",
    borderRadius: 9,
  },
  hpText: {
    position: "absolute",
    width: "100%",
    textAlign: "center",
    color: "#F9FAFB",
    fontWeight: "700",
    fontSize: 12,
    top: -1,
  },

  effectsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 6,
    justifyContent: "center",
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  chipBuff: {
    backgroundColor: "rgba(16,185,129,0.16)",
    borderWidth: 1,
    borderColor: "#10B981",
  },
  chipDebuff: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  chipText: {
    color: "#F3F4F6",
    fontWeight: "700",
    fontSize: 12,
  },

  mods: {
    color: "#94A3B8",
    marginBottom: 8,
  },

  /* center area */
  centerArea: {
    marginVertical: 6,
  },
  turnBanner: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#071029",
    borderWidth: 1,
    borderColor: "#122435",
    borderRadius: 10,
    marginBottom: 6,
  },
  turnText: {
    color: "#93C5FD",
    fontWeight: "800",
  },

  diceRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginBottom: 8,
  },
  diceWrap: {
    alignItems: "center",
    width: 90,
  },
  diceLabel: {
    color: "#CBD5E1",
    fontSize: 12,
    marginBottom: 6,
    textAlign: "center",
  },
  diceBox: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: "#0f1724",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  diceValue: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "900",
  },

  logBox: {
    backgroundColor: "#071020",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#122034",
    marginTop: 6,
    maxHeight: 200,
  },
  logLine: {
    color: "#E5E7EB",
    fontSize: 12,
    marginBottom: 6,
  },

  /* controls per player */
  playerControls: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 6,
  },
  controlBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginHorizontal: 6,
    minWidth: 92,
    alignItems: "center",
  },
  controlBtnActive: {
    backgroundColor: "#14B8A6",
  },
  attackBtnActive: {
    backgroundColor: "#e94560",
  },
  defendBtnActive: {
    backgroundColor: "#0ea5e9",
  },
  controlBtnDisabled: {
    backgroundColor: "#374151",
  },
  controlText: {
    color: "#fff",
    fontWeight: "800",
  },

  /* global controls/footer */
  controls: {
    alignItems: "center",
    marginTop: 8,
  },
  resetBtn: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  resetText: {
    color: "#fff",
    fontWeight: "800",
  },
  footer: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 6,
  },
});
