const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

const HUGGING_FACE_API_KEY = process.env.HUGGING_FACE_API_KEY || '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';

// Modelos de Hugging Face (intentaremos usarlos primero)
const HF_MODELS = {
  spanish: 'pysentimiento/robertuito-sentiment-analysis',
  multilingual: 'lxyuan/distilbert-base-multilingual-cased-sentiments-student',
  english: 'cardiffnlp/twitter-roberta-base-sentiment-latest'
};

// Diccionarios mejorados para análisis local
const PALABRAS_SENTIMIENTO = {
  positivas: [
    'feliz', 'alegre', 'excelente', 'bueno', 'genial', 'perfecto', 'increíble',
    'maravilloso', 'fantástico', 'hermoso', 'amor', 'encanta', 'gustar', 'éxito',
    'victoria', 'ganar', 'mejor', 'contento', 'satisfecho', 'positivo', 'bien',
    'agradecido', 'afortunado', 'sonrisa', 'risa', 'diversión', 'esperanza',
    'optimista', 'brillante', 'espectacular', 'extraordinario', 'fascinante',
    'estupendo', 'magnífico', 'sobresaliente', 'encantador', 'admirable',
    'recomendable', 'útil', 'valioso', 'eficiente', 'efectivo', 'logro', 'felicidad'
  ],
  negativas: [
    'triste', 'malo', 'terrible', 'horrible', 'pésimo', 'odio', 'molesto',
    'enojado', 'frustrado', 'decepcionado', 'dolor', 'sufrimiento', 'problema',
    'error', 'fallo', 'perder', 'pérdida', 'peor', 'difícil', 'negativo',
    'deprimente', 'aburrido', 'cansado', 'enfermo', 'preocupado', 'miedo',
    'ansiedad', 'desastre', 'fracaso', 'lamentable', 'insoportable', 'mierda',
    'porquería', 'basura', 'asco', 'disgusto', 'desagradable', 'inútil',
    'deficiente', 'defectuoso', 'feo', 'detestable', 'patético', 'miserable', 'jueputa', 'perra', 'maldito', 'triplejuputa', 'cabronazo', 
    'hijo de la gran puta', 'chingada', 'chingar', 'pinche', 'culero', 'culiada', 'zorra', 'puta'
  ],
  intensificadores: [
    'muy', 'demasiado', 'extremadamente', 'súper', 'ultra', 'totalmente',
    'completamente', 'absolutamente', 'increíblemente', 'bastante', 'realmente',
    'verdaderamente', 'sumamente', 'altamente', 'excesivamente'
  ],
  negadores: [
    'no', 'nunca', 'jamás', 'tampoco', 'ningún', 'ninguno', 'nada', 'nadie'
  ]
};

// Endpoint principal de análisis con fallback
app.post('/api/analyze', async (req, res) => {
  try {
    const { text, model = 'spanish' } = req.body;

    if (!text) {
      return res.status(400).json({ 
        error: 'El campo "text" es requerido' 
      });
    }

    console.log(`Analizando: "${text.substring(0, 50)}..."`);

    // Intentar con Hugging Face primero
    try {
      const hfResult = await analyzeWithHuggingFace(text, model);
      return res.json(hfResult);
    } catch (hfError) {
      console.log('Hugging Face no disponible, usando análisis local avanzado');
      
      // Fallback a análisis local mejorado
      const localResult = analyzeLocally(text, model);
      return res.json(localResult);
    }

  } catch (error) {
    console.error('Error general:', error.message);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// Análisis con Hugging Face
async function analyzeWithHuggingFace(text, model) {
  const selectedModel = HF_MODELS[model] || HF_MODELS.spanish;
  
  const response = await axios.post(
    `https://api-inference.huggingface.co/models/${selectedModel}`,
    { 
      inputs: text,
      options: { wait_for_model: true }
    },
    {
      headers: {
        'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );

  const results = Array.isArray(response.data[0]) ? response.data[0] : response.data;
  
  let maxScore = -1;
  let topSentiment = null;

  results.forEach(item => {
    if (item.score > maxScore) {
      maxScore = item.score;
      topSentiment = item;
    }
  });

  const sentiment = normalizeSentiment(topSentiment.label);

  return {
    success: true,
    text: text,
    model: selectedModel,
    source: 'Hugging Face API',
    analysis: {
      sentiment: sentiment,
      confidence: (maxScore * 100).toFixed(2),
      label: topSentiment.label,
      allScores: results.map(r => ({
        label: r.label,
        score: (r.score * 100).toFixed(2)
      }))
    },
    timestamp: new Date().toISOString()
  };
}

// Análisis local mejorado (SIEMPRE FUNCIONA)
function analyzeLocally(text, model) {
  const textoLower = text.toLowerCase();
  const palabras = textoLower.split(/\s+/);
  
  let scorePositivo = 0;
  let scoreNegativo = 0;
  let multiplicador = 1;
  let negacionActiva = false;
  
  const palabrasDetectadas = {
    positivas: [],
    negativas: [],
    intensificadores: [],
    negadores: []
  };

  // Análisis palabra por palabra con contexto
  palabras.forEach((palabra, index) => {
    // Detectar negadores
    if (PALABRAS_SENTIMIENTO.negadores.includes(palabra)) {
      negacionActiva = true;
      palabrasDetectadas.negadores.push(palabra);
      setTimeout(() => negacionActiva = false, 2); // Afecta las próximas 2 palabras
    }

    // Detectar intensificadores
    if (PALABRAS_SENTIMIENTO.intensificadores.includes(palabra)) {
      multiplicador = 1.5;
      palabrasDetectadas.intensificadores.push(palabra);
    }

    // Detectar palabras positivas
    const esPositiva = PALABRAS_SENTIMIENTO.positivas.some(p => palabra.includes(p));
    if (esPositiva) {
      const puntos = 1 * multiplicador;
      if (negacionActiva) {
        scoreNegativo += puntos;
        palabrasDetectadas.negativas.push(palabra);
      } else {
        scorePositivo += puntos;
        palabrasDetectadas.positivas.push(palabra);
      }
      multiplicador = 1;
    }

    // Detectar palabras negativas
    const esNegativa = PALABRAS_SENTIMIENTO.negativas.some(p => palabra.includes(p));
    if (esNegativa) {
      const puntos = 1 * multiplicador;
      if (negacionActiva) {
        scorePositivo += puntos;
        palabrasDetectadas.positivas.push(palabra);
      } else {
        scoreNegativo += puntos;
        palabrasDetectadas.negativas.push(palabra);
      }
      multiplicador = 1;
    }
  });

  // Calcular sentimiento final
  const total = scorePositivo + scoreNegativo;
  let sentiment;
  let confidence;

  if (total === 0) {
    sentiment = 'neutral';
    confidence = 60;
  } else {
    const ratioPositivo = scorePositivo / total;
    
    if (ratioPositivo > 0.65) {
      sentiment = 'positive';
      confidence = Math.min(95, 60 + (ratioPositivo * 40));
    } else if (ratioPositivo < 0.35) {
      sentiment = 'negative';
      confidence = Math.min(95, 60 + ((1 - ratioPositivo) * 40));
    } else {
      sentiment = 'neutral';
      confidence = 60 + Math.abs(ratioPositivo - 0.5) * 20;
    }
  }

  return {
    success: true,
    text: text,
    model: 'Análisis Local Avanzado con NLP',
    source: 'Local Processing Engine',
    analysis: {
      sentiment: sentiment,
      confidence: confidence.toFixed(2),
      label: sentiment.charAt(0).toUpperCase() + sentiment.slice(1),
      allScores: [
        { label: 'Positive', score: ((scorePositivo / (total || 1)) * 100).toFixed(2) },
        { label: 'Negative', score: ((scoreNegativo / (total || 1)) * 100).toFixed(2) },
        { label: 'Neutral', score: (total === 0 ? 100 : 0).toFixed(2) }
      ],
      details: {
        positiveWords: palabrasDetectadas.positivas.length,
        negativeWords: palabrasDetectadas.negativas.length,
        intensifiers: palabrasDetectadas.intensificadores.length,
        negations: palabrasDetectadas.negadores.length,
        detectedWords: palabrasDetectadas
      }
    },
    timestamp: new Date().toISOString()
  };
}

// Normalizar etiquetas
function normalizeSentiment(label) {
  const labelLower = label.toLowerCase();
  
  if (labelLower.includes('pos') || labelLower === 'positive') return 'positive';
  if (labelLower.includes('neg') || labelLower === 'negative') return 'negative';
  if (labelLower.includes('neu') || labelLower === 'neutral') return 'neutral';
  
  return 'neutral';
}

// Endpoint para análisis por lotes
app.post('/api/analyze-batch', async (req, res) => {
  try {
    const { texts, model = 'spanish' } = req.body;

    if (!texts || !Array.isArray(texts)) {
      return res.status(400).json({ 
        error: 'El campo "texts" debe ser un array' 
      });
    }

    const results = texts.map(text => {
      try {
        return analyzeLocally(text, model);
      } catch (error) {
        return {
          text: text,
          error: error.message
        };
      }
    });

    res.json({
      success: true,
      results: results,
      total: texts.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      error: 'Error en análisis por lotes',
      message: error.message
    });
  }
});

// Endpoint de modelos
app.get('/api/models', (req, res) => {
  res.json({
    models: [
      {
        id: 'spanish',
        name: 'Análisis en Español',
        description: 'Optimizado para español con detección avanzada'
      },
      {
        id: 'multilingual',
        name: 'Multilingüe',
        description: 'Soporta múltiples idiomas'
      },
      {
        id: 'english',
        name: 'Inglés',
        description: 'Optimizado para inglés'
      }
    ]
  });
});

// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    engine: 'Local NLP + Hugging Face Fallback',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║  🤖 Analizador de Sentimientos con IA     ║
║     (Motor Híbrido - Siempre Disponible)  ║
╚═══════════════════════════════════════════╝

🚀 Servidor: http://localhost:${PORT}
📊 API: http://localhost:${PORT}/api
🏥 Health: http://localhost:${PORT}/api/health

✨ Características:
   • Análisis local avanzado (siempre disponible)
   • Fallback automático a Hugging Face
   • Detección de negaciones e intensificadores
   • Soporte para groserías y lenguaje coloquial

Presiona Ctrl+C para detener
  `);
});