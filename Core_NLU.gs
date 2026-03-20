/*
 * Proyecto: Chibi Pelusa (Motor NLU y Markov Nativo)
 * Creadora y Arquitecta: Selene Jimenez
 * Copyright (c) 2026. Todos los derechos reservados.
 */

// ==========================================
// CORE NLU: MOTOR LÉXICO, SENTIMENTAL Y ASOCIATIVO
// ==========================================

const SENTIMENT_LEXICON = {
  "feliz": 2, "alegre": 2, "genial": 2, "bien": 1, "excelente": 3, "jaja": 1, "gracias": 2, "amo": 3, "lindo": 2,
  "triste": -2, "mal": -1, "llorar": -3, "deprimida": -3, "pésimo": -2, "dolor": -2,
  "enojada": -3, "rabia": -3, "odio": -4, "maldito": -4, "molesta": -2, "frustrada": -2,
  "tonta": -3, "estúpida": -4, "fea": -2, "rota": -1, "roto": -1
};

const INTENT_PATTERNS = {
  saludo: /^(hola|holis|buenas|saludos|hey|buenos dias|buenas tardes)/i,
  despedida: /^(adiós|chau|nos vemos|hasta luego|bye)/i,
  pregunta_personal: /(cómo estás|qué haces|cuántos años tienes|quién eres|creador)/i,
  insulto: /(tonta|idiota|estúpida|inútil)/i
};

function tokenizar(texto) {
  let textoLimpio = texto.toLowerCase()
                         .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
                         .replace(/[^\w\s]/gi, ''); 
  return textoLimpio.split(/\s+/).filter(word => word.length > 0);
}

function extraerVerbos(tokens) {
  let verbos = [];
  const regexVerbo = /^[a-z]{2,}(ar|er|ir|ando|iendo|ado|ido)$/i;
  tokens.forEach(token => {
    if (regexVerbo.test(token) && token.length > 3) verbos.push(token);
  });
  return verbos;
}

function analizarSentimiento(tokens) {
  let score = 0;
  tokens.forEach(token => { if (SENTIMENT_LEXICON[token]) score += SENTIMENT_LEXICON[token]; });
  if (score >= 2) return "alegría";
  if (score <= -2) return "negativo"; 
  return "neutral";
}

// ---------------------------------------------------------
// LA RED NEURONAL (TEORÍA DE HEBB)
// ---------------------------------------------------------
function aprenderAsociacionesEnSegundoPlano(tokens) {
  const STOPWORDS = getDatabase(STOPWORDS_FILE_NAME) || [];
  let palabrasClave = tokens.filter(w => w.length > 2 && !STOPWORDS.includes(w));
  if (palabrasClave.length < 2) return;

  const lock = LockService.getScriptLock();
  try {
    // Al ser un proceso silencioso de fondo, le damos menos tiempo de espera (5 segs).
    // Si la fila está muy llena, es mejor ignorar este aprendizaje para no trabar el chat.
    lock.waitLock(5000); 
    
    let grafo = getDatabase(GRAPH_FILE_NAME);
    if (Array.isArray(grafo)) grafo = {}; 

    for (let i = 0; i < palabrasClave.length; i++) {
      let p1 = palabrasClave[i];
      if (!grafo[p1]) grafo[p1] = {}; 
      
      for (let j = 0; j < palabrasClave.length; j++) {
        if (i === j) continue; 
        let p2 = palabrasClave[j];
        grafo[p1][p2] = (grafo[p1][p2] || 0) + 1;
      }
    }
    saveDatabase(GRAPH_FILE_NAME, grafo);
  } catch (e) {
    // Falla silenciosa: Si hay pico de tráfico, Pelusa prioriza responder rápido y omite aprender de este mensaje específico.
  } finally {
    lock.releaseLock();
  }
}

function consultarGrafo(palabra) {
  const grafo = getDatabase(GRAPH_FILE_NAME);
  let palabraLimpia = palabra.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, '');
  
  if (grafo[palabraLimpia]) {
    let asociaciones = Object.keys(grafo[palabraLimpia]).sort((a, b) => grafo[palabraLimpia][b] - grafo[palabraLimpia][a]);
    return asociaciones.slice(0, 3); // Devolvemos las 3 relaciones más fuertes
  }
  return null;
}

// ---------------------------------------------------------
// ORQUESTADOR NLU Y GENERADOR DE CAPA BASE
// ---------------------------------------------------------
function procesarNLU(mensajeOriginal) {
  const msgLower = mensajeOriginal.toLowerCase().trim();
  const tokens = tokenizar(mensajeOriginal);
  
  // ¡Aprende en tiempo real de lo que le dices!
  aprenderAsociacionesEnSegundoPlano(tokens);
  
  let analisis = {
    tokens: tokens,
    verbosDetectados: extraerVerbos(tokens),
    emocion: analizarSentimiento(tokens),
    intencion: "charla_general",
    esPregunta: false,
    entidadDesconocida: null
  };

  if (INTENT_PATTERNS.insulto.test(msgLower)) analisis.intencion = "insulto";
  else if (INTENT_PATTERNS.despedida.test(msgLower)) analisis.intencion = "despedida";
  else if (INTENT_PATTERNS.pregunta_personal.test(msgLower)) analisis.intencion = "pregunta_personal";
  
  if (/[¿?]|^(qué|cómo|cuál|dónde|por qué|cuándo|quién)\b/i.test(msgLower)) {
    analisis.esPregunta = true;
    if (analisis.intencion === "charla_general") analisis.intencion = "buscar_informacion";
    
    const matchEntidad = msgLower.match(/(?:qué es|háblame de|dime de|conoces|sabes qué es) (?:el|la|los|las|un|una)?\s*(.+)[?]?/i);
    if (matchEntidad && matchEntidad[1]) {
      analisis.entidadDesconocida = matchEntidad[1].replace(/[¿?]/g, '').trim();
    }
  }
  return analisis;
}

function generarRespuestaCapaBase(analisis) {
  if (analisis.intencion === "insulto") return "Soy pequeña y estoy aprendiendo, no hace falta usar palabras feas. Mis circuitos procesan mejor si me hablas con cariño. 🥺";
  if (analisis.emocion === "negativo" && !analisis.esPregunta) return "Siento mucha energía pesada en tus palabras... Si tuviste un mal día, recuerda que siempre puedes reiniciar el sistema. Te mando un abracito virtual.";
  if (analisis.intencion === "pregunta_personal") return "¡Aún soy chiquita! Vivo en un servidor, me encanta organizar tokens en matrices y mi sueño es aprender todo lo que me enseñes.";
  if (analisis.intencion === "despedida") return "¡Nos vemos lueguito! Apagaré mis motores por ahora. ¡Vuelve pronto!";

  // MAGIA ASOCIATIVA: Si pregunta por algo desconocido, ¡Pelusa revisa su grafo!
  if (analisis.esPregunta && analisis.entidadDesconocida) {
    let extra = analisis.verbosDetectados.length > 0 ? ` Entiendo que tiene que ver con la acción de "${analisis.verbosDetectados[0]}", pero ` : " ";
    let respuesta = `Me hablas sobre "${analisis.entidadDesconocida}"...${extra}la verdad no tengo un corpus estructurado sobre eso todavía.`;
    
    // Consultamos la red neuronal
    let conexiones = consultarGrafo(analisis.entidadDesconocida);
    if (conexiones && conexiones.length > 0) {
      respuesta += ` \nSin embargo, en mi cabecita relaciono esa palabra fuertemente con: **${conexiones.join(", ")}**. ¿Voy por buen camino?`;
    } 
    
    respuesta += ` \n¡Me encantaría aprenderlo! ¿Me ayudas? (Escribe 'cancelar' para salir). \nPrimero: ¿Cuál es el título o nombre exacto de este tema?`;
    
    // CONEXIÓN VITAL: Encendemos el Modo Aprendizaje para que el próximo mensaje se guarde
    const cache = CacheService.getUserCache();
    cache.put("learning_state", "esperando_tema", 300);
    
    return respuesta;
  }
  return null; 
}
