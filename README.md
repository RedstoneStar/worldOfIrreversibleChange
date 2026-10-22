---
title: World of Irreversible Change
emoji: 🏮
colorFrom: yellow
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# World of Irreversible Change — Ren & Sora

A living, 24/7 autonomous AI world heavily inspired by teamLab's *"World of Irreversible Change"* and classical Japanese *Byōbu* (gold-leaf folding screen) art.

## What Makes This World Alive

- **Two Primordial Founders (Ren & Sora)**: Begin in a sunlit clearing beside a central lake with islands, winding braided rivers, scattered ponds, and a circular forest basin ringed by mountains.
- **Blank-Slate Epistemic Discovery**: Ren and Sora start knowing nothing about what is edible or how to build. They inspect, smell, taste, and test plants, mushrooms, reeds, flint, and clay—naming each species in their own words and passing their discoveries to each other and to future generations.
- **The "Flesh, Bone & Nerve" Somatic Engine**: Dozens of continuous physical and psychological sensations—sore right shoulder from hauling timber, stiff lower back from hard ground, kinked neck from ducking under low ceilings, **claustrophobia** in cramped shelters, aching knee joints in damp humidity, wet clothes, woodsmoke sting, warmth, hunger, thirst, loneliness, and aesthetic wonder.
- **Zero Predetermined Tech Trees**: Structures are conceived organically out of bodily and emotional needs. When a low shelter makes them feel claustrophobic or stiff-necked, they decide to raise the roof beams, carve a window facing the water, weave soft fern sleeping mats, add a veranda, or eventually build multi-story timber pavilions and pagoda towers.
- **100% Free AI & 24/7 Hosting**:
  - Works out of the box with a cascading free AI pipeline: Google AI Studio (`GEMINI_API_KEY`), Groq (`GROQ_API_KEY`), Pollinations keyless cloud LLM, and the built-in Somatic-Epistemic Deliberative Reasoner.
  - Ready for 100% free 24/7 hosting on **Hugging Face Spaces** (Docker SDK, port `7860`).

## Running Locally

```bash
npm start
```

Then open **http://localhost:7860** in your browser.

## Deploying 24/7 for Free on Hugging Face Spaces

1. Create a free account at [huggingface.co](https://huggingface.co) and click **New Space**.
2. Choose **Docker** as the Space SDK (Blank template) and **CPU Basic (Free)**.
3. Push this folder to your Space repository (or upload `Dockerfile`, `package.json`, `shared/`, `server/`, `public/`, and `README.md`).
4. *(Optional)* In your Space's **Settings → Variables and secrets**, add `GEMINI_API_KEY` (free from [aistudio.google.com](https://aistudio.google.com)) or configure it live in the web UI.
