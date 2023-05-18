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


grade("Pre-grade. Classify ancestors to hide node.")
  

grade-.-b
selector--userData-->Box3-->a



subgraph type
  direction TB

  a("1x: semantic, viewport, hardmax")
  a-.-tag{blacklist}
  a-->b{interactive}
  b---canvas("2x: img, text")
  b---css3d("3x: form, video")

end

canvas-->html2canvas
css3d-->CSS3DRenderer
```

### lists
- `blacklist` () -- `.ignore,style,script,link,meta,base,keygen,canvas[data-engine],param,source,track,area,br,wbr`
- `whitelist` (semantic) -- `div,main,section,article,header,footer,aside,table,details,form,ul,ol,li`
- `html2canvas` (legible) -- `img,svg,h1,h2,h3,p,li,ul,ol`
- `CSS3DRenderer` (interactive) -- `iframe,frame,embed,object,table,form,video,audio`
