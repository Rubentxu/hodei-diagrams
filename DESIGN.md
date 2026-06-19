---

name: Hodei Diagram

colors:
primary:
900: "#0A0F1A"
800: "#101826"
700: "#162033"
600: "#1E293B"
500: "#334155"

accent:
blue: "#3B82F6"
cyan: "#06B6D4"
purple: "#8B5CF6"
emerald: "#10B981"

semantic:
success: "#22C55E"
warning: "#F59E0B"
danger: "#EF4444"
info: "#3B82F6"

neutral:
white: "#FFFFFF"
100: "#F8FAFC"
200: "#E2E8F0"
300: "#CBD5E1"
400: "#94A3B8"

typography:
display:
fontFamily: "Inter"
fontWeight: 700

heading:
fontFamily: "Inter"
fontWeight: 600

body:
fontFamily: "Inter"
fontWeight: 400

mono:
fontFamily: "JetBrains Mono"

spacing:
xs: 4
sm: 8
md: 12
lg: 16
xl: 24
xxl: 32

radius:
sm: 6
md: 10
lg: 14

motion:
fast: 120ms
normal: 180ms
slow: 280ms

---

# Overview

Rust Diagram Platform es una herramienta visual para arquitectos de software, ingenieros DevOps, desarrolladores y equipos de plataforma.

Debe transmitir:

* Potencia
* Precisión
* Escalabilidad
* Profesionalidad
* Rapidez

Nunca debe parecer una herramienta corporativa genérica ni una aplicación de consumo.

La sensación debe recordar a una mezcla entre:

* Figma
* Linear
* Cursor
* Raycast
* Draw.io

---

# Visual Personality

La aplicación debe sentirse:

* Técnica
* Moderna
* Precisa
* Sobria
* Profesional

Evitar:

* Gradientes exagerados
* Glassmorphism excesivo
* Colores saturados
* Animaciones llamativas

---

# Layout Philosophy

La aplicación está optimizada para maximizar el espacio útil del canvas.

Prioridades:

1. Canvas
2. Herramientas
3. Inspector
4. Navegación

El canvas siempre debe ocupar la mayor superficie posible.

---

# Navigation

## Top Bar

Contiene únicamente acciones globales:

* Archivo
* Editar
* Ver
* Insertar
* Organizar
* Herramientas

Además:

* Undo
* Redo
* Zoom
* Compartir
* Presentar

---

## Left Sidebar

Biblioteca de componentes.

Categorías:

* Básicas
* UML
* BPMN
* C4
* AWS
* Azure
* Kubernetes
* Terraform
* Jenkins
* Bases de Datos

Debe permitir búsqueda instantánea.

---

## Right Inspector

Panel contextual.

Muestra:

* Estilo
* Texto
* Datos
* Comportamiento
* Metadatos

La edición debe ser inmediata.

Sin botones "Aplicar".

---

# Canvas

El canvas es el centro del producto.

Características:

* Infinite canvas
* Zoom infinito
* Pan fluido
* Grid opcional
* Snap inteligente
* Guías inteligentes

La interacción debe sentirse tan fluida como Figma.

---

# Diagram Components

Los elementos deben tener:

* Bordes limpios
* Esquinas ligeramente redondeadas
* Sombras mínimas
* Alto contraste

Nunca usar efectos decorativos innecesarios.

---

# Properties Panel

El inspector utiliza formularios compactos.

Inspiración:

* Unreal Engine
* JetBrains IDEs
* Figma

Debe priorizar densidad de información.

---

# Version History

La línea temporal de versiones debe ser visible.

Objetivos:

* Recuperación rápida
* Comparación de cambios
* Navegación temporal

Inspiración:

* Git
* Notion History
* Figma Versioning

---

# Presentation Mode

Modo enfocado para mostrar diagramas.

Oculta:

* Sidebars
* Inspector
* Menús

Muestra únicamente:

* Canvas
* Navegación
* Puntero

---

# Accessibility

Objetivos:

* WCAG AA
* Navegación por teclado completa
* Alto contraste
* Zoom de interfaz

---

# Design Goals

El usuario debe percibir que:

"Estoy utilizando una herramienta profesional diseñada para sistemas complejos."

No debe parecer una herramienta de dibujo.

Debe parecer una plataforma de modelado visual para ingeniería.
