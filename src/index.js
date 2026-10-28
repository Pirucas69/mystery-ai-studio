const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function errorResponse(message, status = 400) {
  return json({ success: false, error: message }, status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/api/health") {
      return json({
        success: true,
        service: "Mystery AI Studio API",
        status: "online",
        aiConfigured: Boolean(env.GEMINI_API_KEY),
      });
    }

    if (url.pathname === "/api/generate-script" && request.method === "POST") {
      if (!env.GEMINI_API_KEY) {
        return errorResponse(
          "L'IA n'est pas encore configurée. Ajoute GEMINI_API_KEY dans les secrets Cloudflare.",
          503
        );
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return errorResponse("Le corps de la requête doit être du JSON valide.");
      }

      const topic = String(body.topic || "").trim();
      const duration = Number(body.duration || 60);
      const language = String(body.language || "français").trim();

      if (!topic) {
        return errorResponse("Indique un sujet pour la vidéo.");
      }

      if (topic.length > 500) {
        return errorResponse("Le sujet ne doit pas dépasser 500 caractères.");
      }

      const prompt = [
        "Tu es scénariste professionnel de vidéos TikTok consacrées aux mystères,",
        "aux faits historiques étranges et aux phénomènes inexpliqués.",
        "Écris un script original en " + language + " pour une vidéo d'environ " + duration + " secondes.",
        "Sujet : " + topic,
        "Structure : accroche immédiate, récit captivant, révélation ou conclusion.",
        "Propose 5 à 8 scènes avec, pour chacune, une narration et une idée visuelle.",
        "Ne présente pas une théorie non vérifiée comme un fait.",
        "Retourne uniquement un JSON valide avec cette structure :",
        '{"title":"...","hook":"...","narration":"...","scenes":[{"narration":"...","visual":"..."}],"caption":"...","hashtags":["..."]}',
      ].join("\n");

      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.8,
                responseMimeType: "application/json",
              },
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          console.error("Gemini API error:", response.status);
          return errorResponse(
            "Le service IA a refusé la requête. Vérifie la clé et les quotas API.",
            502
          );
        }

        const text = result.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("");

        if (!text) {
          return errorResponse("L'IA n'a pas retourné de script.", 502);
        }

        let script;

        try {
          script = JSON.parse(text);
        } catch {
          return errorResponse("La réponse de l'IA n'est pas un JSON valide.", 502);
        }

        return json({ success: true, script });
      } catch (error) {
        console.error("Generation error:", error);
        return errorResponse("Impossible de contacter le service IA.", 502);
      }
    }

    return errorResponse("Route introuvable.", 404);
  },
};
