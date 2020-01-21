(async function () {
  'use strict';

  const { DateTime } = luxon;

  const nodeTypes = ['commit', 'tree', 'blob'];

  // or axios or anything
  const commits = await d3.json('/api/commits');
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
    c.shortHash = c.hash.substr(0,7);
    if (c.type === 'commit') {
      c.children = [];
      c.parents = [];
    } else {
      c.wrappers = [];
    }
  });

  const arrows = [];

  // link the lists and get arrow references
  commits.forEach(commit => {
    if (commit.parentNodes) {
      commit.parents = commit.parentNodes.map(p => commits.find(c => c.hash === p));
      commit.parents.forEach(parent => {
        if (parent) {
          parent.children.push(commit);
          arrows.push({
            from: commit,
            to: parent
          });
        }
      });
    }
    if (commit.nestedNodes) {
      commit.nested = commit.nestedNodes.map(n => commits.find(c => c.hash === n.hash));
      commit.nested.forEach(nest => {
        if (nest) {
          nest.wrappers.push(commit);
          arrows.push({
            from: commit,
            to: nest
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
      const timeSeq = commit.timeSeq + ((i+1)/(commit.nested.length+2)/Math.pow(10,depth));
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
  const st = commits.filter(c => c);
  st.sort((a, b) => a.timeSeq - b.timeSeq);
  st.forEach((commit, i) => {
    commit.yPos = i;
  });
  const yHeights = {
    min: 0,
    max: st.length-1
  };

  // build branches
  const cs = commits.filter(c => c.type === 'commit');
  cs.sort((a,b) => a.date - b.date);
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


  const positionStrength = 0.025;
  let currentStroke = 'none';
  let currentFill = 'steelblue';
  let currentLineFill = 'steelblue';
  let showLines = false;

  const margin = {
    top: 50,
    left: 20,
    bottom: 20,
    right: 40
  };
  const width = document.getElementById('viz').clientWidth; // window.innerWidth / 2;
  const height = window.innerHeight;

  const radius = 5;

  // make details not grow too big
  const node = document.getElementById('node');
  node.style.width = node.clientWidth+'px';

  // the functions to move dots on each axis
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

    const text = svg.append('text');

    text.attr('id', 't' + d.shortHash);
    text.attr('x', function() { return d.x + 12; });
    text.attr('y', function() { return d.y; });
    text.text(d.shortHash);
  }

  function handleMouseOut(d) {
    d3.select(this)
      .attr('r', radius);
    d3.select('#t' + d.shortHash).remove();
  }

  const nodeHash = document.getElementById('node-hash');
  const nodeDetails = document.getElementById('node-details');
  async function handleClick(d) {
    console.log('clicked', d); // TODO: what else would we like to show?
    nodeHash.innerText = d.hash;
    nodeHash.className = 'type-'+d.type;
    nodeDetails.innerText = (d.catfile || []).join('\n');

    if (d.type === 'blob') {
      nodeDetails.innerText = await d3.json(`/api/blob/${d.hash}`);
    }
  }

  function updateDOM() {
    const dots = svg.selectAll('.commit').data(commits);
    // what to do when creating new points:
    dots.enter()
      .append('circle')
        .attr('class', 'commit')
        .style('stroke', currentStroke)
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

    const lineData = showLines ? arrows : [];
    const lines = svg.selectAll('.arrow').data(lineData);

    lines.enter()
      .append('line')
      .attr('class', 'arrow')
      .attr('stroke-width',1)
      //.attr('marker-end','url(#arrow)')
      .attr('x1',d => d.from.x)
      .attr('y1',d => d.from.y)
      .attr('x2',d => d.to.x)
      .attr('y2',d => d.to.y)
      .attr('stroke',currentLineFill);

    lines.transition()
      .duration(3)
      .attr('x1',d => d.from.x)
      .attr('y1',d => d.from.y)
      .attr('x2',d => d.to.x)
      .attr('y2',d => d.to.y)
      .attr('stroke',currentLineFill);

    lines.exit().remove();
  }

  document.getElementById('unAxis').addEventListener('click', function () {
    x = null;
    y = null;

    simulation
      .force('charge', d3.forceManyBody().distanceMax(20).strength(-15))
      .force('center', null)
      .force('x', d3.forceX(width / 2).strength(positionStrength))
      .force('y', d3.forceY(height / 2).strength(positionStrength))
      .force('center', d3.forceCenter( width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(5))
      .alpha(1)
      .restart();
  });

  /*
  // break into groups by type
  document.getElementById('xAxis').addEventListener('click', function() {

    x = d3.scaleOrdinal()
      .domain(nodeTypes)
      .range([margin.left, margin.left + 30, margin.left + 100]);

    simulation
      .force('charge', null)
      .force('center', null)
      .force('x', d3.forceX(d => x(d.type)))
      .alpha(1)
      .restart();

  });
  */

  // TODO: do this with yAxis and restore old xAxis?
  document.getElementById('xAxis').addEventListener('click', function() {

    x = d3.scaleLinear()
      .domain([xWidths.min, xWidths.max])
      .range([margin.left, margin.left + 130]);

    simulation
      .force('charge', null)
      .force('center', null)
      .force('x', d3.forceX(d => x(d.xPos)))
      .alpha(1)
      .restart();

  });

  /*
  // by time
  document.getElementById('yAxis').addEventListener('click', function() {

    y = d3.scaleLinear()
      .domain([timeSeq.min, timeSeq.max])
      .range([height - margin.bottom, margin.top]);

    simulation
      .force('charge', null)
      .force('center', null)
      .force('y', d3.forceY(d => y(d.timeSeq)))
      .alpha(2)
      .restart();

  });
  */

  document.getElementById('yAxis').addEventListener('click', function() {

    y = d3.scaleLinear()
      .domain([yHeights.min, yHeights.max])
      .range([height - margin.bottom, margin.top+50]);

    simulation
      .force('charge', null)
      .force('center', null)
      .force('y', d3.forceY(d => y(d.yPos)))
      .alpha(2)
      .restart();

  });

  document.getElementById('color').addEventListener('click', function() {

    const colorScale = d3.scaleOrdinal()
      .domain(nodeTypes)
      .range(d3.schemeSet1);

    currentFill = d => colorScale(d.type);
    currentLineFill = d => colorScale(d.to.type);

    svg.selectAll('.commit').data(commits)
      .transition()
        .duration(750)
        .style('fill', currentFill);

    if (showLines) {
      svg.selectAll('.arrow').data(arrows)
        .transition()
          .duration(750)
          .style('fill', currentLineFill);
    }

    // build legend: https://www.d3-graph-gallery.com/graph/custom_legend.html
    // Add one dot in the legend for each name.
    var size = 15;
    svg.selectAll('legend-dot')
      .data(nodeTypes)
      .enter()
      .append('rect')
        .attr('class', 'legend-dot')
        .attr('x', 10)
        .attr('y', function(d,i){ return 40 + i*(size+5)})
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
        .attr('y', function(d,i){ return 40 + i*(size+5) + (size/2)})
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
      svg.selectAll('.arrow').data(arrows)
        .transition()
          .duration(750)
          .style('fill', currentLineFill);
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

}());
