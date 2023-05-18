# mpos-precept
Imposter layout to represent DOM rects as THREE bounds.

### Process
```mermaid
flowchart TB;




subgraph box
  b("1x: semantic, viewport, hardmax")
end

subgraph canvas
  c("2x: img, text")
end

subgraph css3d
  s("3x: video, form")
end

window -.- selector
subgraph selector
 direction TB
 child--maxnode-->parent
 parent--depth-->child


end
selector--type-->box



box-->canvas
box-->css3d

```
