(async function () {
  'use strict';

  const { DateTime } = luxon;

  const nodeTypes = ['commit', 'tree', 'blob'];

  // or axios or anything
  const commits = (await d3.json('/api/commits')).filter(c => c);
  commits.forEach(c => {
    if (c.author && c.author.date) {
      c.author.date = DateTime.fromISO(c.author.date);
      if (c.author.date.isValid) {
        c.date = c.author.date;
      }
    }
    if (c.committer && c.committer.date) {
      c.committer.date = DateTime.fromISO(c.committer.date);
      if (c.committer.date.isValid) {
        c.date = c.committer.date;
      }
    }
    c.shortHash = c.hash.substr(0, 7);
    if (c.type === 'commit') {
      c.children = [];
      c.parents = [];
    } else {
      c.wrappers = [];
    }
  });

  const arrowsUp = [];
  const arrowsOver = [];

  // link the lists and get arrow references
  commits.forEach(commit => {
    if (commit.parentNodes) {
      commit.parents = commit.parentNodes.map(p => commits.find(c => c.hash === p));
      commit.parents.forEach(parent => {
        if (parent) {
          parent.children.push(commit);
          arrowsUp.push({
            target: commit,
            source: parent
          });
        }
      });
    }
    if (commit.nestedNodes) {
      commit.nested = commit.nestedNodes.map(n => commits.find(c => c.hash === n.hash));
      commit.nested.forEach(nest => {
        if (nest) {
          nest.wrappers.push(commit);
          arrowsOver.push({
            source: commit,
            target: nest
          });
        }
      });
    }
  });

  // put commits in order, assume there aren't duplicates
  // new Set() creates unique list
  const dates = [...new Set(commits.map(c => c.date).filter(c => c))];
  dates.sort();
  commits.filter(c => c.date).forEach(c => {
    c.timeSeq = dates.indexOf(c.date);
    copyNest(c, 0);
  });
  function copyNest(commit, depth) {
    commit.nested.forEach((n, i) => {
      const timeSeq = commit.timeSeq + ((i+1)/(commit.nested.length+2)/Math.pow(10, depth));
      if (typeof n.timeSeq === 'undefined' || timeSeq < n.timeSeq) {
        n.timeSeq = timeSeq;
      }
      copyNest(n, depth+1);
    });
  }

  const timeSeq = {
    min: 0,
    max: dates.length
  };
  const missingSeq = commits.filter(c => typeof c.timeSeq === 'undefined');
  missingSeq.forEach(c => {
    // a tree or blob without a commit, assume (badly) "latest"
    c.timeSeq = timeSeq.max;
  });
  const st = [...commits]; // so I can sort it and not break the original
  st.sort((a, b) => a.timeSeq - b.timeSeq);
  st.forEach((commit, i) => {
    commit.yTime = i;
  });
  st.sort((a, b) => a.hash < b.hash ? 1 : -1);
  st.forEach((commit, i) => {
    commit.yHash = i;
  });
  const yHeights = {
    min: 0,
    max: st.length-1
  };

  // build branches
  const cs = commits.filter(c => c.type === 'commit');
  cs.sort((a, b) => a.date - b.date);
  let xWidths = {
    min: 0,
    max: -1
  };
  cs.forEach(commit => {
    if (typeof commit.xPos !== 'undefined') {
      return; // already set
    }
    xWidths.max++;
    commit.xPos = xWidths.max;
    setChildCommitXPos(commit);
  });

  function setChildCommitXPos(commit) {
    if (!commit.children) {
      return;
    }
    commit.children.forEach((child, i) => {
      if (i === 0) {
        // straight up
        child.xPos = commit.xPos;
      } else {
        // move over
        xWidths.max++;
        child.xPos = xWidths.max;
      }
      setChildCommitXPos(child);
    });
  }

  // move trees to the right of that
  xWidths.max += 2; // blank space between
  xWidths.treeStart = xWidths.max;
  cs.forEach(commit => {
    commit.nested.forEach(nest => {
      nest.xPos = xWidths.treeStart;
      setNestedXPos(nest);
    });
  });

  function setNestedXPos(commit) {
    if (!commit.nested) {
      return;
    }
    commit.nested.forEach(nest => {
      if (nest.type === 'tree') {
        nest.xPos = commit.xPos + 1;
        if (xWidths.max < nest.xPos) {
          xWidths.max = nest.xPos;
        }
        setNestedXPos(nest);
      }
    });
  }
  const tr = commits.filter(c => c.type === 'tree' && typeof c.xPos === 'undefined');
  if (tr) {
    // trees without a commit
    xWidths.max++;
    tr.forEach(c => {
      c.xPos = xWidths.max;
    });
  }

  // move blobs to the right of that
  xWidths.max += 2; // blank space between
  xWidths.blob = xWidths.max;
  commits.filter(c => c.type === 'blob').forEach(commit => {
    commit.xPos = xWidths.blob;
  });
  const bl = commits.filter(c => c.type === 'blob' && typeof c.xPos === 'undefined');
  if (bl) {
    // blobs without a tree
    xWidths.max++;
    bl.forEach(c => {
      c.xPos = xWidths.max;
    });
  }

  //console.log(commits, xWidths, timeSeq);


  const commitDistance = 25;
  const radius = 7;
  const positionStrength = 0.025;
  let currentFill = 'steelblue';
  let currentLineFill = 'steelblue';
  let showLines = false;
  let showTags = false;

  const margin = {
    top: 50,
    left: 20,
    bottom: 20,
    right: 40
  };
  const width = document.getElementById('viz').clientWidth; // window.innerWidth / 2;
  const height = window.innerHeight;

  // make details not grow too big
  const node = document.getElementById('node');
  node.style.width = node.clientWidth+'px';

  // the functions to move dots on each axis
  let yProp = null;
  let y = null;
  let x = null;


  const svg = d3.select('#viz');

  const simulation = d3.forceSimulation()
    .alphaDecay(1 - (0.001**(1 / 600)))
    .force('charge', d3.forceManyBody().distanceMax(20).strength(-15))
    .force('collide', d3.forceCollide().radius(5))
    .force('center', d3.forceCenter( width / 2, height / 2));

  init();
  function init() {

    svg
      .attr('width', width)
      .attr('height', height);

    simulation
      .nodes(commits)
      .on('tick', updateDOM);

  }


  function handleMouseOver(d) {

    d3.select(this)
      .attr('r', radius * 1.4);

    if (!showTags) {
      const text = svg.append('text');

      text.attr('id', 't' + d.shortHash);
      text.attr('x', function() { return d.x + 12; });
      text.attr('y', function() { return d.y - 2; });
      text.attr('font', '12pt Arial');
      //text.attr('color', currentFill(d))
      text.attr('dominant-baseline', 'central');

      text.text(d.shortHash);
    }
  }

  function handleMouseOut(d) {
    d3.select(this)
      .attr('r', radius);
    const tag = d3.select('#t' + d.shortHash);
    if (tag) {
      tag.remove();
    }
  }

  const nodeHash = document.getElementById('node-hash');
  const nodeRefs = document.getElementById('node-refs');
  const nodeDetails = document.getElementById('node-details');
  async function handleClick(d) {
    //console.log('clicked', d); // TODO: what else would we like to show?
    nodeHash.innerText = d.hash;
    // FRAGILE: ASSUME: if commits aren't in a blob we're also showing types
    if (x && y) {
      nodeHash.className = 'type-'+d.type;
    } else {
      nodeHash.className = '';
    }
    nodeRefs.innerText = d.refs ? d.refs.join(' ') : '';
    nodeDetails.innerText = (d.catfile || []).join('\n');

    if (d.type === 'blob') {
      // ASSUME: blob is text
      const res = await fetch(`/api/blob/${d.hash}`);
      nodeDetails.innerText = await res.text();
    }
  }

  function updateDOM() {
    const dots = svg.selectAll('.commit').data(commits);
    // what to do when creating new points:
    dots.enter()
      .append('circle')
        .attr('class', 'commit')
        .style('stroke', 'none')
        //.style('stroke', 'steelblue')
        //.style('stroke-width', 2)
        .style('fill', currentFill)
        .attr('r', radius)
        .on('mouseover', handleMouseOver)
        .on('mouseout', handleMouseOut)
        .on('click', handleClick);
    // what to do when removing points:
    dots.exit().remove();

    dots
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);

    const lineUpData = showLines ? arrowsUp : [];
    const linesUp = svg.selectAll('.arrowUp').data(lineUpData);

    const linkVertical = d3.linkVertical()
      .x(d => d.x)
      .y(d => d.y);

    linesUp.enter()
      .append('path')
      .attr('class', 'arrowUp')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('stroke', currentLineFill)
      .attr('d', linkVertical);

     linesUp.transition()
      .duration(3)
      .attr('d', linkVertical)
      .attr('stroke', currentLineFill);

    linesUp.exit().remove();


    const lineOverData = showLines ? arrowsOver : [];
    const linesOver = svg.selectAll('.arrowOver').data(lineOverData);
    const linkHorizontal = d3.linkHorizontal()
      .x(d => d.x)
      .y(d => d.y);

    linesOver.enter()
      .append('path')
      .attr('class', 'arrowOver')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('stroke', currentLineFill)
      .attr('d', linkHorizontal);
      //.attr('marker-end', 'url(#arrow)');

    linesOver.transition()
      .duration(3)
      .attr('d', linkHorizontal)
      .attr('stroke', currentLineFill);

    linesOver.exit().remove();

    const tagsData = (showTags && x && y) ? commits : [];
    const tags = svg.selectAll('.tag').data(tagsData);

    tags.enter()
      .append('text')
      .attr('class', 'tag')
      .attr('x', d => x(xWidths.max))
      .attr('dominant-baseline', 'central')
      .attr('y', d => y(d[yProp]))
      .text(d => {
        let label = d.shortHash;
        // TODO: draw box with rounded border
        if (d.refs) {
          label += ' ' + d.refs.map(r => r.split('/').slice(-1)[0]).join(' ');
        }
        return label;
      })
      .on('click', handleClick);

    tags.exit().remove();

  }

  document.getElementById('unAxis').addEventListener('click', function () {
    x = null;
    y = null;
    yProp = null;

    simulation
      .force('charge', d3.forceManyBody().distanceMax(20).strength(-15))
      .force('center', null)
      .force('x', d3.forceX(width / 2).strength(positionStrength))
      .force('y', d3.forceY(height / 2).strength(positionStrength))
      .force('center', d3.forceCenter( width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(radius))
      .alpha(1)
      .restart();

    svg.attr('height', window.innerHeight);

  });

  document.getElementById('alphabetical').addEventListener('click', function() {

    yProp = 'yHash';
    y = d3.scaleLinear()
      .domain([yHeights.min, yHeights.max])
      .range([margin.top+(commits.length*commitDistance), margin.top+50]);
      // TODO: what if we have more than a page's worth?
      //.range([height - margin.bottom, margin.top+50]);

    x = d3.scaleLinear()
      .domain([xWidths.min, xWidths.max])
      .range([margin.left, margin.left + 130]);


    simulation
      .force('charge', null)
      .force('center', null)
      .force('y', d3.forceY(d => y(d[yProp])))
      .force('x', d3.forceX(d => x(xWidths.max-1)))
      .alpha(2)
      .restart();

    svg.attr('height', (commits.length*commitDistance)+100);

    showLines = false;
    showTags = false; // TODO: animate or re-show tags after simulation finishes
  });

  document.getElementById('parentChild').addEventListener('click', function() {

    yProp = 'yTime';
    y = d3.scaleLinear()
      .domain([yHeights.min, yHeights.max])
      .range([margin.top+(commits.length*commitDistance), margin.top+50]);
      // TODO: what if we have more than a page's worth?
      //.range([height - margin.bottom, margin.top+50]);

    x = d3.scaleLinear()
      .domain([xWidths.min, xWidths.max])
      .range([margin.left, margin.left + 130]);

    simulation
      .force('charge', null)
      .force('center', null)
      .force('y', d3.forceY(d => y(d[yProp])))
      .force('x', d3.forceX(d => x(d.xPos)))
      .alpha(2)
      .restart();

    svg.attr('height', (commits.length*commitDistance)+100);

    showTags = false; // TODO: animate or re-show tags after simulation finishes
  });

  document.getElementById('color').addEventListener('click', function() {

    const colorScale = d3.scaleOrdinal()
      .domain(nodeTypes)
      .range(d3.schemeSet1);

    currentFill = d => colorScale(d.type);
    currentLineFill = d => colorScale(d.target.type);

    svg.selectAll('.commit').data(commits)
      .transition()
        .duration(750)
        .style('fill', currentFill);

    if (showLines) {
      svg.selectAll('.arrowUp').data(arrowsUp)
        .transition()
          .duration(750)
          .style('stroke', currentLineFill);
      svg.selectAll('.arrowOver').data(arrowsOver)
        .transition()
          .duration(750)
          .style('stroke', currentLineFill);
    }

    // build legend: https://www.d3-graph-gallery.com/graph/custom_legend.html
    // Add one dot in the legend for each name.
    var size = 15;
    svg.selectAll('legend-dot')
      .data(nodeTypes)
      .enter()
      .append('rect') // TODO: circle
        .attr('class', 'legend-dot')
        .attr('x', 10)
        .attr('y', function(d, i){ return 40 + i*(size+5)})
        .attr('width', size)
        .attr('height', size)
        .style('fill', d => colorScale(d));

    // Add one dot in the legend for each name.
    svg.selectAll('legend-label')
      .data(nodeTypes)
      .enter()
      .append('text')
        .attr('class', 'legend-label')
        .attr('x', 10 + size*1.2)
        .attr('y', function(d, i){ return 40 + i*(size+5) + (size/2)})
        .style('fill', d => colorScale(d))
        .text(d => d)
        .attr('text-anchor', 'left')
        .style('alignment-baseline', 'middle');
  });

  document.getElementById('uncolor').addEventListener('click', function () {

    currentFill = 'steelblue';
    currentLineFill = 'steelblue'
    svg.selectAll('.commit').data(commits)
      .transition()
        .duration(750)
        .style('fill', currentFill);

    if (showLines) {
      svg.selectAll('.arrowUp').data(arrowsUp)
        .transition()
          .duration(750)
          .style('stroke', currentLineFill);
      svg.selectAll('.arrowOver').data(arrowsOver)
        .transition()
          .duration(750)
          .style('stroke', currentLineFill);
    }

    svg.selectAll('.legend-label').remove();
    svg.selectAll('.legend-dot').remove();

  });

  document.getElementById('lines').addEventListener('click', function () {
    showLines = true;
    // TODO: fade
  });

  document.getElementById('unlines').addEventListener('click', function () {
    showLines = false;
    // TODO: fade
  });

  document.getElementById('tags').addEventListener('click', function () {
    showTags = true;
    // TODO: fade
  });

  document.getElementById('untags').addEventListener('click', function () {
    showTags = false;
    // TODO: fade
  });

}());
