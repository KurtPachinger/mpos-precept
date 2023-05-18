# mpos-precept
Imposter layout to represent DOM rects as THREE bounds.

### Process
```mermaid
graph TB;


subgraph box
  b("1x: semantic, viewport, hardmax")
end

subgraph canvas
  c("2x: img, text")
end

subgraph css3d
  s("3x: video, form")
end

root -.- parent
parent--depth-->child
child--maxnode-->parent
child--type-->box

box-->canvas
box-->css3d

```
