# mpos-precept
Imposter layout to represent DOM rects as THREE bounds.

### Process
```mermaid
flowchart TB

window-.-selector
subgraph selector
 direction TB
 child--softmax-->parent
 parent--depth-->child
end

grade("Pre-grade. Sanitize.")
selector-->grade-->a

subgraph type
  direction TB
  a("1x: structure, viewport")
  grade-.-tag{blacklist}
  a-->b{interactive}
  b--no---poster("2x: img, text")
  b--yes---native("3x: form, video")
end

poster-->html-to-image
native-->CSS3DRenderer
```
