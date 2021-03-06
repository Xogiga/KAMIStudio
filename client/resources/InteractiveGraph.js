/* This module add the graph container to the UI
 * this module trigger graphUpdate events
 * @ Author Adrien Basso blandin
 * This module is part of regraphGui project
 * this project is under AGPL Licence
 */
define([
    "resources/d3/d3.js",
    "resources/d3/d3-context-menu.js",
    "resources/requestFactory.js",
    "resources/inputMenu.js",
    "resources/newNodeSelect.js"

], function (d3, d3ContextMenu, RqFactory, inputMenu, newNode) {
    /* Create a new interractive graph structure
     * @input : container_id : the container to bind this hierarchy
     * @input : dispatch : the dispatch event object
     * @input : server_url : the regraph server url
     * @return : a new InteractiveGraph object
     */
    return function InteractiveGraph(container_id, new_svg_name, svg_width, svg_height, dispatch, request, readOnly, localDispatch) {
        var disp = dispatch;
        var server_url = "http://0.0.0.0:5000";
        var factory = new RqFactory(server_url);
        let nodeClipboard = {
            path: null,
            nodes: []
        };
        //var size = d3.select("#"+container_id).node().getBoundingClientRect();//the svg size
        // d3.select("#"+container_id)//the main svg object
        // 	// .append("div")
        // 	// .attr("id","tab_frame")
        // 	.append("svg:svg")

        //var svg = d3.select(document.createElement("svg:svg"))
        var svgDom = document.createElementNS("http://www.w3.org/2000/svg", "svg:svg");
        svgDom.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");

        var svg = d3.select(svgDom)
            .attr("id", new_svg_name)
            .attr("height", svg_height)
            .attr("width", svg_width);

        svg.append('svg:rect')
            .attr('width', svg_width) // the whole width of g/svg
            .attr('height', svg_height) // the whole heigh of g/svg
            .attr('fill', 'none')
            .attr('pointer-events', 'all');
        var width = +svg.attr("width"),
            height = +svg.attr("height"),
            transform = d3.zoomIdentity;
        var svg_content = svg.append("g")//the internal zoom and drag object for svg
            .classed("svg_zoom_content", true);
        var simulation;//the force simulation
        var radius = 30;
        var links_f;//the link force
        //var request = new RqFactory(server_url);
        var g_id = "/";//the graph id in the hierarchy
        var type_list;
        var locked = false;//lock event actions
        var zoom;
        var saveX, saveY;//remember position of node before drag event
        var beginX, beginY;//remember position of node at start of drag
        var startOfLinkNode;//id of node that started the link
        var edgesList;//the edges of the graph
        let newNodeSelect = null;
        let newNodeId = null;
        if (!readOnly) {
            newNodeId = new_svg_name + "NewNode";
            newNodeSelect = new newNode(newNodeId, d3.select("#tab_frame"), dispatch, request, this);
        }
        let existsEdge = function (source, target) {
            return edgesList.some(d => d.source.id == source && d.target.id == target);
        };

        let buttonsDiv = document.createElementNS("http://www.w3.org/1999/xhtml", "div");

        //if not readonly
        createButtons();
        /* initialize all the svg objects and forces
         * this function is self called at instanciation
         */
        (function init() {
            initSvg();
            simulation = d3.forceSimulation();
            // initForce();
        }());
        /* init all the forces
         * this graph has :
         * 	-collision detection
         * 	-link forces : force nodes linked to stay close
         * 	-many bodies forces : repulsing force between nodes
         * 	-center force : foce node to stay close to the center
         */

        function initForce(path, graph, config) {
            simulation.stop();
            simulation.force("link", null);
            //simulation.force("chargeAgent", null);
            //simulation.force("chargeBnd", null);
            //simulation.force("chargeBrk", null);
            simulation.force("link", d3.forceLink().id(function (d) { return d.id; }));
            //    .force("charge", new d3.forceManyBody().distanceMax(radius * 10))
            //    .force("center", d3.forceCenter(width / 2, height / 2))
            //    .force("collision", d3.forceCollide(radius + radius / 4));
            // // simulation.on("tick", move);
            //simulation.alphaDecay(0.06);
            simulation.stop();
            if (path) {
                loadType(path, graph, config, function (rep) { loadGraph(path, rep, null, config); });
            }
        }


        function initForceKami(path, graph, config) {
            //simulation = d3.forceSimulation();
            simulation.stop();
            simulation.force("link", null);
            simulation.force("charge", d3.forceManyBody());
            simulation.force("charge").strength(-100);
            simulation.force("charge").distanceMax(radius * 10);
            simulation.force("charge").distanceMin(radius / 10);
            //simulation.force("center", null);
            //simulation.force("center", d3.forceCenter(width / 2, height / 2));
            //simulation.force("chargeAgent", null);
            //simulation.force("chargeBnd", null);
            //simulation.force("chargeBrk", null);
            //simulation.force("collision", d3.forceCollide(radius + radius / 4));
            //simulation.force("collision").strength(0.3);
            simulation.alphaDecay(0.06);
            let ancestorArray = config.ancestor_mapping;
            // For every node, count the number of edges that go to a
            // bnd or mod node. Also count the number of edges that come
            // from a mod node. Used in calculation of edge strengths.
            var inter_edge_count = {};
            for (i = 0; i < graph.edges.length; i++) {
                from_id = graph.edges[i].from;
                to_id = graph.edges[i].to;
                if (ancestorArray[to_id] == "bnd" || ancestorArray[to_id] == "mod") {
                    if (from_id in inter_edge_count) {
                        inter_edge_count[from_id] = inter_edge_count[from_id] + 1;
                    }
                    else {
                        inter_edge_count[from_id] = 1;
                    };
                };
                if (ancestorArray[from_id] == "mod") {
                    if (to_id in inter_edge_count) {
                        inter_edge_count[to_id] = inter_edge_count[to_id] + 1;
                    }
                    else {
                        inter_edge_count[to_id] = 1;
                    };
                };
            };
            var distanceOfLink = function (l) {
                let edge_length =
                    {
                        "state": { "residue": 70, "site": 70, "region": 70, "gene": 70 },
                        "residue": { "site": 70, "region": 70, "gene": 70 },
                        "site": { "region": 70, "gene": 70 },
                        "region": { "gene": 70 },
                        //"site": { "region": 10, "gene": 10, "bnd": 200 },
                        //"region": { "gene": 50, "bnd": 200, "mod": 200 },
                        //"gene": { "bnd": 200, "mod": 200 },
                        //"mod": { "state": 200 },
                        //"syn": { "gene": 200 },
                        //"deg": { "gene": 200 },
                    };
                let source_type = ancestorArray[l.source["id"]];
                let target_type = ancestorArray[l.target["id"]];
                var len_value = 100; // Default edge length.
                if (edge_length.hasOwnProperty(source_type)) {
                    if (edge_length[source_type].hasOwnProperty(target_type)) {
                        var len_value = edge_length[source_type][target_type];
                    }
                }
                return len_value;
            };
            var strengthOfLink = function (l) {
                let source_type = ancestorArray[l.source["id"]];
                let target_type = ancestorArray[l.target["id"]];
                var strength_value = 0.5  ; // Default edge strength.
                // Links from components to bnd must be weakened if many links
                // go out of the same component. Same for links from components
                // to mod or from mod to state.
                if (target_type == "bnd" || target_type == "mod") {
                    var strength_value = 0.1 / inter_edge_count[l.source["id"]];
                }
                if (source_type == "mod") {
                    var strength_value = 0.1 / inter_edge_count[l.target["id"]];
                }
                return strength_value;
            };
            simulation.force("link", d3.forceLink().id(function (d) { return d.id; }));
            simulation.force("link").distance(distanceOfLink);
            simulation.force("link").strength(strengthOfLink);

            //simulation.force("link").iterations(2);

            // var chargeAgent = d3.forceManyBody();
            // //chargeAgent.theta(0.2);
            // chargeAgent.strength(-500);
            // chargeAgent.distanceMax(radius * 10);
            // // chargeAgent.distanceMin(0);
            // var initAgent = chargeAgent.initialize;

            // chargeAgent.initialize = (function () {
            // 	return function (nodes) {
            // 		var agent_nodes = nodes.filter(function (n, _i) {
            // 			return (
            // 				ancestorArray[n.id] == "agent")
            // 		});
            // 		initAgent(agent_nodes);
            // 	};
            // })();

            // // simulation.force("chargeAgent", chargeAgent);

            // var chargeBnd = d3.forceManyBody();
            // chargeBnd.strength(-1000);
            // chargeBnd.distanceMax(radius * 10);
            // var initbnd = chargeBnd.initialize;
            // chargeBnd.initialize = function (nodes) {
            // 	var bnd_nodes = nodes.filter(function (n, i) {
            // 		return (
            // 			ancestorArray[n.id] === "agent" 
            // 			// ancestorArray[n.id] === "mod"
            // 		)
            // 	});
            // 	initbnd(bnd_nodes);
            // };

            // simulation.force("chargeBnd",chargeBnd);


            // var chargeBrk = d3.forceManyBody();
            // chargeBrk.strength(-10000);
            // chargeBrk.distanceMax(radius * 10);
            // var initbrk = chargeBrk.initialize;
            // chargeBrk.initialize = function (nodes) {
            // 	var brk_nodes = nodes.filter(function (n, i) {
            // 		return (
            // 			ancestorArray[n.id] === "brk" ||
            // 			ancestorArray[n.id] === "mod"
            // 		)
            // 	});
            // 	initbrk(brk_nodes);
            // };

            // simulation.force("chargeBrk",chargeBrk);



            // simulation.on("tick", move);
            // simulation.on("end", function () {
            // 	simulation.force("chargeAgent", null);
            // 	simulation.force("chargeBrk", null);
            // 	simulation.force("chargeBnd", null);
            // }
            // );

            simulation.stop();

            var node_to_symbol = function (n) {
                var ancestor = ancestorArray[n.id];
                if (
                    ancestor == "gene" ||
                    ancestor == "residue"
                ) {
                    return d3.symbolCircle;
                }

                else if (ancestor == "region") {
                    return d3.symbolCircle;
                    //return {
                    //    draw: function (context, size) {
                    //        let radius =  Math.sqrt(size)/2,
                    //            ratio = 1.3;
                    //        context.ellipse(0, 0, radius*ratio, radius);
                    //    }
                    //}
                }

                // Draw a star for states.
                else if (ancestor == "state") {
                    return {
                        draw: function (context, size) {
                            let n_arms = 18,
                                long_arm_mult = 1.2,
                                // delta is the angle that spans
                                // one arm of the star.
                                delta = (Math.PI * 2 / n_arms),
                                r_short = Math.sqrt(size/Math.PI),
                                r_long = r_short * long_arm_mult;
                            context.moveTo(0, r_long);
                            for (let arm = 1 ; arm <= n_arms ; ++arm) {
                                let theta1 = arm * delta - delta / 2,
                                    x_short = Math.sin(theta1) * r_short,
                                    y_short = Math.cos(theta1) * r_short;
                                context.lineTo(x_short, y_short);
                                // Let the last arm get closed 
                                // by context.closePath()
                                if (arm != n_arms) {
                                    let theta2 = arm * delta,
                                        x_long = Math.sin(theta2) * r_long,
                                        y_long = Math.cos(theta2) * r_long;
                                    context.lineTo(x_long, y_long);
                                }
                            }
                            context.closePath();
                        }
                    };
                }

                // Draw fused circles for composite sites.
                //else if (ancestor == "compo") {
                //    return {
                //        draw: function (context, size) {
                //            // Angle between the top and side circles.
                //            // Only values between 30 and 90 degree make sense.
                //            // 90 = the two circles completely fused into a single cicle.
                //            // 30 = the two circles at the limit of meing unfused.
                //            let angle = 55, // Degree.
                //                scale = 0.75, // Scale down the radius compared to sites.
                //                radius = Math.sqrt(size/Math.PI) * scale,
                //                radian = angle * Math.PI / 180,
                //                x_offset = Math.cos(radian) * 2 * radius,
                //                y_offset =  Math.sin(radian) * 2 * radius;
                //            context.arc(-x_offset,  0, radius,        -radian,         radian, true);
                //            context.arc( 0,  y_offset, radius, Math.PI+radian,        -radian, false);
                //            context.arc( x_offset,  0, radius, Math.PI-radian, Math.PI+radian, true);
                //            context.arc( 0, -y_offset, radius,         radian, Math.PI-radian, false);
                //        }
                //    }
                //}

                // Draw a half-square half-circle for mods.
                else if (ancestor == "mod") {
                    return {
                        draw: function (context, size) {
                            let radius = Math.sqrt(size)/2,
                                side = Math.sqrt(size);
                            context.moveTo(      0, -side/2);
                            context.lineTo(-side/2, -side/2);
                            context.lineTo(-side/2,  side/2);
                            context.lineTo(      0,  side/2);
                            context.arc(0, 0, radius, Math.PI/2, 3*Math.PI/2, true);
                        }
                    }
                }

                else if (
                    ancestor == "syn" ||
                    ancestor == "deg") {
                    return d3.symbolSquare;
                }

                else if (ancestor == "bnd") {
                    bndTypeChk = n.attrs.type
                    if (bndTypeChk != null) {
                        bndType = n.attrs.type.strSet.pos_list;
                        if (bndType == "be") {
                            //return d3.symbolDiamond;
                            // Draw a long diamond for tests.
                            return {
                                draw: function (context, size) {
                                    let side = Math.sqrt(size),
                                        ratio = 1.15;
                                    // Good old Pythagoras.
                                    diagonal =  Math.sqrt(2*side*side),
                                        x = diagonal/2*ratio
                                        y = diagonal/2/ratio
                                    context.moveTo( 0,  y);
                                    context.lineTo( x,  0);
		                    context.lineTo( 0, -y);
                                    context.lineTo(-x,  0);
		                    context.closePath();
                                }
                            };
                        } else { return d3.symbolSquare; }
                    } else { return d3.symbolSquare; }
                }

                else {
                    return d3.symbolCircle;
                }
            };
            var node_to_size = function (n) {
                var ancestor = ancestorArray[n.id];
                if (ancestor == "mod" ||
                    ancestor == "syn" ||
                    ancestor == "deg" ||
                    ancestor == "bnd"
                ) { return 2000; }
                else if (
                    ancestor == "region"
                ) { return 4000; }
                else if (
                    ancestor == "site"
                ) { return 2500; }
                else if (
                    ancestor == "residue"
                ) { return 2500; }
                else if (
                    ancestor == "state"
                ) { return 2200; }
                else if (
                    ancestor == "gene"
                ) { return 6000; }
                else {
                    return 4000;
                }
            };

            //\definecolor{gene-color}{HTML}{FFA19E}
            //\definecolor{region-color}{HTML}{FFCDAD}
            //\definecolor{site-color}{HTML}{FFFDC2}
            //\definecolor{residue-color}{HTML}{E4D6FF}
            //\definecolor{state-color}{HTML}{A3DEFF}
            //\definecolor{bnd-color}{HTML}{9EFFC5}
            //\definecolor{mod-color}{HTML}{9DAEFD}
            //\definecolor{edge-color}{HTML}{B8B8B8}

            var node_to_color = function (n) {
                let ancestor = ancestorArray[n.id];
                if (ancestor == "state") {
                    stateTestChk = n.attrs.test
                    if (stateTestChk != null) {
                        stateTest = n.attrs.test.strSet.pos_list;
                        if (stateTest == "false") { 
                            return "gray"; // gray
                        } else {
                            return "#A3DEFF"; // yellow
                        }
                    } else {
                        return "#A3DEFF"; // yellow
                    }
                } else if (ancestor == "bnd") {
                    bndTestChk = n.attrs.test
                    if (bndTestChk != null) {
                        bndTest = n.attrs.test.strSet.pos_list;
                        if (bndTest == "false") { 
                            return "#E63234"; // red
                        } else { 
                            return "#9EFFC5"; // green 
                        }
                    } else { 
                        return "#9EFFC5"; // green
                    }
                 } else if (ancestor == "mod") {
                    modValsChk = n.attrs.value
                    if (modValsChk != null) {
                        modVals = n.attrs.value.strSet.pos_list;
                        if (modVals == "false") { 
                            return "gray"; // gray
                        } else {
                            return "#9DAEFD"; // blue
                        }
                    } else {
                        return "#9DAEFD"; // blue
                    }              
                } else {                
                    return ({
                        "gene":    "#FFA19E",
                        "region":  "#FFCDAD", // "#AB8472",
                        "site":    "#FFFDC2",
                        "residue": "#E4D6FF", // "#94716A",
                        "syn":     "#55A485",
                        "deg":     "#8C501E" // "#A47066",
                    }[ancestor]);
                }
            };

            //var node_to_color = function (n) {
            //    let ancestor = ancestorArray[n.id];
            //    if (ancestor == "state") {
            //        stateTestChk = n.attrs.test
            //        if (stateTestChk != null) {
            //            stateTest = n.attrs.test.strSet.pos_list;
            //            if (stateTest == "false") { 
            //                return "gray"; // gray
            //            } else {
            //                return "#FFD33D"; // yellow
            //            }
            //        } else {
            //            return "#FFD33D"; // yellow
            //        }
            //    } else if (ancestor == "bnd") {
            //        bndTestChk = n.attrs.test
            //        if (bndTestChk != null) {
            //            bndTest = n.attrs.test.strSet.pos_list;
            //            if (bndTest == "false") { 
            //                return "#E63234"; // red
            //            } else { 
            //                return "#82A532"; // green 
            //            }
            //        } else { 
            //            return "#82A532"; // green
            //        }
            //     } else if (ancestor == "mod") {
            //        modValsChk = n.attrs.value
            //        if (modValsChk != null) {
            //            modVals = n.attrs.value.strSet.pos_list;
            //            if (modVals == "false") { 
            //                return "gray"; // gray
            //            } else {
            //                return "#3399ff"; // blue
            //            }
            //        } else {
            //            return "#3399ff"; // blu
            //        }              
            //    } else {                
            //        return ({
            //            "gene":    "#AB7372",
            //            "region":  "#DA8C8A", // "#AB8472",
            //            "site":    "#EC928F",
            //            "residue": "#FF9E9B", // "#94716A",
            //            "syn":     "#55A485",
            //            "deg":     "#8C501E" // "#A47066",
            //        }[ancestor]);
            //    }
            //};

            var link_to_dotStyle = function (l) {
                var ancestorSource = ancestorArray[l.source.id];
                var ancestorTarget = ancestorArray[l.target.id];
                if (ancestorSource == "mod" || ancestorTarget == "mod") {
                    return ("Dotted");
                } else {
                    return ("notDotted");
                }
                //if (components.indexOf(ancestorSource) > -1 &&
                //    components.indexOf(ancestorTarget) > -1) {
                //        return ("notDotted");
                //} else if (ancestorSource == "half-act" &&
		//    components3.indexOf(ancestorTarget) > -1) {
                //        return ("notDotted");
                //} else if (ancestorSource == "state" &&
                //    components.indexOf(ancestorTarget) > -1) {
                //        return ("notDotted");
                //} else if (components.indexOf(ancestorSource) > -1 &&
                //    ancestorTarget == "half-act") {
                //        return ("notDotted");
                //} else {
                //    return ("Dotted");
                //}
            };

            var link_to_color = function (l) {
                var userColor = l.color
                var ancestorSource = ancestorArray[l.source.id];
                var ancestorTarget = ancestorArray[l.target.id];
                var components = ["residue", "region", "gene", "site", "state"];
                var components2 = ["bnd", "brk", "is_bnd", "is_free"];
                if (userColor == "unspecified") {
                    // Default colors depending on the source and target.
                    if (components.indexOf(ancestorSource) > -1 &&
                        components.indexOf(ancestorTarget) > -1) {
                            return "gray";
                    } else if (ancestorSource == "half-act" &&
                        components2.indexOf(ancestorTarget) > -1) {
                            return "gray";
                    } else {
                        return "black";
                    }
                } else {
                    return userColor;
                }
            };

            var shapeClassifier =
                {
                    "shape": node_to_symbol,
                    "size": node_to_size,
                    "dotStyle": link_to_dotStyle,
                    "nodeColor": node_to_color,
                    "edgeColor": link_to_color
                };
            loadType(path, graph, config, function (rep) { loadGraph(path, rep, shapeClassifier, config); });
        }
        /* init the svg object
         * add arrows on edges
         * add svg context menu
         * add tooltip
         * add zoom and drag behavior
         */
        function initSvg() {
            //add drag/zoom behavior
            zoom = d3.zoom().scaleExtent([0.02, 3]).on("zoom", zoomed);
            zoom.filter(function () { return !event.button && !event.shiftKey; });
            svg.classed("svg-content-responsive", true);
            svg.append("svg:defs").selectAll("marker")
                .data(["arrow_end"])      // Different link/path types can be defined here
                .enter().append("svg:marker")    // This section adds the arrows
                .attr("id", function (d) { return d; })
                .attr("refX", 0)
                .attr("refY", 3)
                .attr("markerWidth", 10)
                .attr("markerHeight", 10)
                .attr("orient", "auto")
                .attr("markerUnits", "strokeWidth")
                // .attr("position","90%")
                .append("svg:path")
                .attr("d", "M0,0 L0,6 L9,3 z");
            svg.on("contextmenu", d3ContextMenu(function () { return svgMenu(); }));//add context menu
            svg.call(zoom).on("dblclick.zoom", null);
            svg.call(d3.drag().on("drag", selectionHandler).on("end", selectionHandlerEnd).on("start", selectionHandlerStart));
            svg.on("click", svgClickHandler);
            // d3.select("body").on("keydown", svgKeydownHandler);

            d3.select("#tab_frame").append("div")//add the description tooltip
                .attr("id", "n_tooltip")
                .classed("n_tooltip", true)
                .style("visibility", "hidden");
            //svg_content.append("svg:image")
            //    .attr("width", 900)
            //    .attr("height", 400)
            //    .attr("x", function () { return width / 2 - 450; })
            //    .attr("y", function () { return height / 2 - 200; });
            //    .attr("xlink:href", "resources/toucan.png");
        };
        // this.initSvg = initSvg;
        /* this fonction  is triggered by tick events
         * move all the svg object (node and links)
         * movement can be due to force simulation or user dragging
         */


        function move(shapeClassifier) {
            return function () {
                var nodes = svg_content.selectAll("g.node");
                nodes.attr("transform", function (d) {
                    return "translate(" + d.x + "," + d.y + ")";
                });
                svg_content.selectAll(".link, .contact")
                    .attr("d", function (d) {
                        var x1 = d.source.x,
                            y1 = d.source.y,
                            x2 = d.target.x,
                            y2 = d.target.y,
                            dx = x2 - x1,
                            dy = y2 - y1,
                            dr = Math.sqrt(dx * dx + dy * dy),
                            drx = dr,
                            dry = dr,
                            xRotation = 0,
                            largeArc = 0,
                            sweep = 1;

                        // Self edge.
                        if (x1 === x2 && y1 === y2) {
                            xRotation = -45;
                            largeArc = 1;
                            drx = 30;
                            dry = 20;
                            x2 = x2 + 1;
                            y2 = y2 + 1;
                            return "M" + x1 + "," + y1 + "A" + drx + "," + dry + " " + xRotation + "," + largeArc + "," + sweep + " " + x2 + "," + y2;
                        }
                        else {
                            //transf = d3.zoomTransform(svg.node());
                            let nodeRadius = Math.sqrt(shapeClassifier["size"](d.target)) / 1.77245385091;
                            let arrowLength = 10;
                            let arrowWidth = 5;
                            let [arrowX, arrowY] = [x2 - dx * (nodeRadius + arrowLength) / dr, y2 - dy * (nodeRadius + arrowLength) / dr];
                            let [orthoX, orthoY] = [-dy / dr * arrowWidth, dx / dr * arrowWidth];
                            let [arrowLeftX, arrowLeftY] = [arrowX + orthoX, arrowY + orthoY];
                            let [arrowRightX, arrowRightY] = [arrowX - orthoX, arrowY - orthoY];
                            let [endx, endy] = [x2 - dx * nodeRadius / dr, y2 - dy * nodeRadius / dr];

                            if (shapeClassifier["dotStyle"](d) === "Dotted") {
                                let dotArrayLength = ~~(dr / 12);
                                let dottedpoints = Array(~~(dotArrayLength / 2)).fill()
                                    .map((_, i) => [x1 + 2 * i * dx / dotArrayLength,
                                    y1 + 2 * i * dy / dotArrayLength,
                                    x1 + (2 * i + 1) * dx / dotArrayLength,
                                    y1 + (2 * i + 1) * dy / dotArrayLength]);
                                let str = dottedpoints.map(([xd1, yd1, xd2, yd2]) => `L ${xd1} ${yd1} M ${xd2} ${yd2}`)
                                    .join(" ");
                                return `M ${x1} ${y1}` + str + `L ${endx} ${endy} L ${arrowLeftX} ${arrowLeftY} L ${arrowRightX} ${arrowRightY} L ${endx} ${endy}`;
                            }
                            else {
                                return `M ${x1} ${y1} L ${endx} ${endy} L ${arrowLeftX} ${arrowLeftY} L ${arrowRightX} ${arrowRightY} L ${endx} ${endy}`;
                            }
                            //return "M" + x1 + "," + y1 + "A" + drx + "," + dry + " " + xRotation + "," + largeArc + "," + sweep + " " + x2 + "," + y2;
                        }
                        //return "M" + x1 + "," + y1 + "C 1 1, 0 0,"+ x2+ "," + y2;
                    })
                    .style("stroke", function (d) {
                        return shapeClassifier["edgeColor"](d);
		    });
                if (localDispatch) { localDispatch.call("move") };
            };
        }
        /* this fonction  is triggered by zoom events
         * transform the svg container according to zoom
         */
        function zoomed() {
            if (!locked) {
                svg_content.attr("transform", d3.event.transform);
                if (localDispatch) { localDispatch.call("move"); }
            }
        }
        /* update the current view to a new graph
         * this function also load all nodes types
         * @input : graph : the new graph
         * @input : path : the graph path
         * @input : config.noTranslate (bool) : do not resize and center the graph after update
         * @input : config.repDispatch (d3.dispatch) : canal used to signal end of loading to caller
         * @input : config.highlightRel (nodeData -> nodeData -> bool)
         *          which nodes to highlight when hovering over a node
         * @input : config.showAttributes : if true show the node attributes on the graph
         */

        this.update = function update(graph, path, config) {
            simulation.stop();
            g_id = path;
            if (path != "/") {
                svg_content.selectAll("*").remove();
                if (path.search("/kami_base/kami/") == 0) {
                    initForceKami(path, graph, config);
                }
                else {
                    initForce(path, graph, config);
                }
            }
            //else {
            //    svg_content.append("svg:image")
            //        .attr("width", 900)
            //        .attr("height", 400)
            //        .attr("x", function () { return width / 2 - 450 })
            //        .attr("y", function () { return height / 2 - 200 })
            //        .attr("xlink:href", "resources/toucan.png");
            //}
        };

        /* precondition : /kami_base/kami/ is the start of the path */
        function kamiAncestor(path, doSomething) {
            var path2 = path.split("/");
            path2 = path2.slice(3);
            var degree = path2.length;
            var callback = function (err, rep) {
                if (err) {
                    alert(err.currentTarget.response);
                    return false;
                }
                //var rep = JSON.parse(resp.response);
                var mapping = rep.reduce(function (obj, x) {
                    obj[x["left"]] = x["right"];
                    return obj;
                }, {});
                doSomething(mapping);
            }
            request.getAncestors(path, degree, callback);

        };

        /* load all type of a graph, this is needed for node coloration 
         * @input : graph : the new graph
         * @input : path : the graph path
         * @input : callback : the next function to call : loadGraph
         */
        function loadType(path, graph, config, callback) {
            if (path != "/") {
                path = path.split("/");
                if (path.length <= 2) {
                    type_list = [];
                    if (!readOnly && !config.noTranslate) { newNodeSelect.update(type_list) };
                    return callback(graph);
                }
                path.pop();
                path = path.join("/");
                request.getGraph(path, function (e, r) {
                    if (e) console.error(e);
                    else {
                        type_list = r.nodes.map(function (e) {
                            return e.id;
                        });
                        if (!readOnly && !config.noTranslate) { newNodeSelect.update(type_list); }
                        //disp.call("configUpdate",this,type_list);
                        callback(graph);
                    }
                });
            } else callback(graph);
        };
        /* find a specific node in a graph
         * @input : n : the node id
         * @input : graph : the graph object 
         * @return : the node DOM object
         */
        function findNode(n, graph) {
            var ret = graph.filter(function (e) {
                return e.id == n;
            });
            return ret[0];
        }
        /* load a new graph in the svg
         * nodes and edges have context menu
         * nodes can be dragged
         * nodes can be selected with shift + click
         * nodes can be unlocked with ctrl+click
         * nodes can be renamed by double clicking it
         * @input : response : a json structure of the graph
         */
        function loadGraph(path, response, shapeClassifier, config) {
            //define default shapes functions if not defined
            if (!shapeClassifier) { var shapeClassifier = {} };
            if (!shapeClassifier.shape) { shapeClassifier.shape = function (_) { return d3.symbolCircle } };
            if (!shapeClassifier.size) { shapeClassifier.size = function (_) { return 3000 } };
            if (!shapeClassifier.dotStyle) { shapeClassifier.dotStyle = function (_) { return "notDotted" } };
            if (!shapeClassifier.nodeColor) {
                shapeClassifier.nodeColor = function (d) {
                    if (d.type && d.type != "") return "#" + setColor(type_list.indexOf(d.type), type_list.length);
                    else return "#EEEEEE";
                }
            };
            if (!shapeClassifier.edgeColor) { shapeClassifier.edgeColor = function (_) { return "black" } };


            //transform links for search optimisation
            var tmp_links = response.edges.map(function (d) {
                var userColor = "unspecified";
                var edgeColor = d.attrs.color;
                if (edgeColor != null) {
                    var colorVals = d.attrs.color.strSet.pos_list;
                    if (colorVals != null) {
                        var userColor = colorVals[0];
                    }
                }
                var edgeTransType = d.attrs.type;
                var edgeTransitive = false;
                if (edgeTransType != null) {
                    edgeTransitive = d.attrs.type.strSet.pos_list;   
                }
                edge_obj = { source: findNode(d.from, response.nodes),
                             target: findNode(d.to, response.nodes),
                             color: userColor }
                if (path == "/kami_base/kami/action_graph") {
                    //return edge_obj;
                    if (edgeTransitive == false) {
                        return edge_obj;
                    }
                }
                else {
                    return edge_obj;
                }
            });
            // Remove undefined elements from link list.
            links = [];
            for (var i = 0; i < tmp_links.length; i++) {
                if (tmp_links[i]) {
                    links.push(tmp_links[i]);
                }
            }
            edgesList = links;
            // Copy links to a new object that won't get overwritten when
            // showing nugget preview.
            if (path == "/kami_base/kami/action_graph") {
                ag_links = links;
            }


            //add all links as line in the svg
            if (path != "/kami_base/kami/action_graph") {
                var link = svg_content.selectAll(".link")
                    .data(links, function (d) { return d.source.id + "-" + d.target.id; });
                link.enter()//.insert("line","g")
                    .append("path")
                    .classed("link", true)
                    // I think this is where I have to add arrows (Seb)
                    //.attr("marker-mid", "url(#arrow_end)")
                    .on("contextmenu", d3ContextMenu(edgeCtMenu));
                link.exit().remove();
                // svg_content.selectAll(".link")
                // 	.attr("stroke-dasharray", shapeClassifier.dotStyle)
                try {
                    simulation.force("link").links(links);
                }
                catch (err) { return 0; }
            }


            //add all node as circle in the svg
            var node = svg_content.selectAll("g.node")
                .data(response.nodes, function (d) { return d.id; });


            // Compute links of the simplified contact map to the action graph.
            // Function that takes a list of edges to or from action nodes
            // and for each edge returns the gene from or to that action node.
            // (There can actually be more than one output edge for each input 
            // if there is a site formed from several proteins).
            function findGeneNode(input_edges, index_strt) {
                var contact_edges = [];
                for (var i = 0; i < input_edges.length; i++) {
                    var input_edge = input_edges[i];
                    // Find whether the edge is going to an action or coming from
                    // an action.
                    var source_type = input_edge.source.type;
                    var target_type = input_edge.target.type;
                    if (source_type == "bnd" || source_type == "mod") {
                        var direction = "target";
                        var inverse = "source";
                    }
                    else if (target_type == "bnd" || target_type == "mod") {
                        var direction = "source";
                        var inverse = "target";
                    };
                    if (input_edge[direction].type == "gene") {
                        var gene_nodes = [input_edge[direction]];
                    } else {
                        var actors = [input_edge[direction]];
                        var seen_nodes = [actors[0]];
                        var seen_ids = [actors[0].id];
                        while (actors.length > 0) {
                            // Find the outgoing edges from each actor.
                            var act_ids = actors.map((nod) => nod.id)
                            var belong_edges = links
                                .filter((edg) => act_ids.includes(edg.source.id))
                            // The target of each edge become the actor for
                            // the next loop round.
                            var actors = belong_edges
                                .filter((edg) => edg.target.type != "bnd")
                                .filter((edg) => edg.target.type != "mod")
                                .map((edg) => edg.target)
                            // Add actors that were not still seen to the list.
                            for (var j = 0; j < actors.length; j++) {
                                if (seen_ids.includes(actors[j].id) === false) {
                                    seen_nodes.push(actors[j]);
                                    seen_ids.push(actors[j].id);
                                }
                            }
                        }
                        // Find which of the seen nodes are genes.
                        var gene_nodes = seen_nodes.filter((edg) => edg.type == "gene")
                    }
                    // Add one contact edge from each source gene to the bnd node.
                    for (var k = 0; k < gene_nodes.length; k++) {
                        var contact = {};
                        //contact[direction] = gene_nodes[k];
                        //contact[inverse] = input_edge[inverse];
                        // This reverses the direction of mod --> state edges
                        // but for the purpose of the simplified contact map 
                        // only.
                        contact["source"] = gene_nodes[k];
                        contact["target"] = input_edge[inverse];
                        contact["color"] = "unspecified";
                        contact["index"] = index_strt + contact_edges.length
                        contact_edges.push(contact);
                    }
                }
                return contact_edges;
            };
            // Find edges that target a bnd node.
            var num_links_bnd = links.length;
            var bnd_edges = links.filter((edg) => edg.target.type === "bnd");
            var bnd_contact_edges = findGeneNode(bnd_edges, num_links_bnd);
            // Find the edges that target a mod node.
            var num_links_mod_in = links.length + bnd_contact_edges.length;
            var mod_edges_in = links.filter((edg) => edg.target.type === "mod");
            var mod_contact_in = findGeneNode(mod_edges_in, num_links_mod_in);
            // Find the edges that come from a mod node.
            var num_links_mod_out = links.length + bnd_contact_edges.length + mod_contact_in.length;
            var mod_edges_out = links.filter((edg) => edg.source.type === "mod");
            var mod_contact_out = findGeneNode(mod_edges_out, num_links_mod_out);
            var mod_contact_edges = mod_contact_in.concat(mod_contact_out);

            var all_contact_edges = bnd_contact_edges.concat(mod_contact_edges);

            // Conflate every action node that have the same source genes into
            // one contact node.
            // Create the list of genes connected to every action node.
            var gene_cnct_list = {};
            var seen_act_id = [];
            for (var i = 0; i < all_contact_edges.length; i++) {
                var act_source = all_contact_edges[i].source.id;
                var act_target = all_contact_edges[i].target.id;
                if (seen_act_id.includes(act_target)) {
                    gene_cnct_list[act_target].push(act_source);
                }
                else {
                    gene_cnct_list[act_target] = [act_source]
                    seen_act_id.push(act_target)
                };
            }
            // Sort the contact gene lists.
            var gene_cnct_sort = {};
            for (var act_key in gene_cnct_list) {
                unsorted_genes = gene_cnct_list[act_key];
                gene_cnct_sort[act_key] = unsorted_genes.sort();
            }
            // Find which bnd nodes have the same source genes.
            var seen_act_id = [];
            var cnct_nodes = [];
            var cnct_counter = 1;
            for (var key in gene_cnct_sort) {
                if (seen_act_id.includes(key) == false) {
                    genes = gene_cnct_sort[key];
                    cnct_nodes["cct "+cnct_counter] = genes;
                    cnct_counter++;
                    seen_act_id.push(key);
                    for (var key2 in gene_cnct_sort) {
                        if (seen_act_id.includes(key2) == false) {
                            genes2 = gene_cnct_sort[key2];
                            same_genes = true;
                            if (genes.length !== genes2.length) {
                                same_genes = false;
                            }
                            else {
                                for (var i = 0; i < genes.length; i++) {
                                    if (genes[i] !== genes2[i]) {
                                        same_genes = false;
                                        break;
                                    }
                                }
                            };
                            if (same_genes) {
                                seen_act_id.push(key2);
                            };
                        }
                    }
                }
            }
            // Recreate links from the contact nodes (cnct_nodes).
            // The following code works only for contact nodes that
            // have exactly two source genes.
            var simple_contact_edges = [];
            for (var key in cnct_nodes) {
                var gene_list = cnct_nodes[key];
                var gene_set = [];
                for (var i = 0; i < gene_list.length; i++) {
                    if (gene_set.includes(gene_list[i]) == false) {
                        gene_set.push(gene_list[i])
                    }
                }
                if (gene_set.length == 2) {
                    // Select example edges coming from the desired gene.
                    var cnct_source = all_contact_edges.filter((edg) =>
                        edg.source.id === gene_set[0])[0].source;
                    // Select example edges going to the desired gene.
                    var cnct_target = all_contact_edges.filter((edg) =>
                        edg.source.id === gene_set[1])[0].source;
                    var simple_contact = {};
                    simple_contact["source"] = cnct_source;
                    simple_contact["target"] = cnct_target;
                    simple_contact["color"] = "unspecified";
                    simple_contact["index"] = links.length + simple_contact_edges.length
                    simple_contact_edges.push(simple_contact);
                }
            }


            // Add the contact edges.
            if (path == "/kami_base/kami/action_graph") {
                var contact = svg_content.selectAll(".contact")
                    .data(simple_contact_edges, function (d) {
                        return d.source.id + "-" + d.target.id;
                    });
                contact.enter()//.insert("line","g")
                    .append("path")
                    .classed("contact", true)
                    .on("contextmenu", d3ContextMenu(edgeCtMenu));
                contact.exit().remove();
            }


            var node_g = node.enter().insert("g")
                .classed("node", true)
                .call(d3.drag().on("drag", dragged)
                    .on("end", dragNodeEndHighlightRel(config, path))
                    .on("start", dragNodeStart)
                    // .filter(function () { return (d3.event.button == 0) || !readOnly }))//disable right click drag if readOnly
                    .filter(function () { return true }))//disable right click drag if readOnly
                .on("mouseover", mouseOver)
                .on("mouseout", mouseOut)
                //.on("mouseup",function(){d3.selectAll("g").dispatch("endOfLink")})
                .on("click", clickHandler)
                //.on("contextmenu",d3ContextMenu(function(){return nodeCtMenu()}));
                .on("contextmenu", nodeContextMenuHandler);

            svg_content.selectAll("g.node").each(function (d) { if (d.type) d3.select(this).classed(d.type, true) });
            if (config.repDispatch) { config.repDispatch.call("loadingEnded") }

            //add selection rectangle
            svg_content.append("rect")
                .attr("id", "selectionRect")
                .style("visibility", "hidden")
                .data([{ startx: 0, starty: 0 }]);

            //add line for edges creation and deletion
            svg_content.append("line")
                .attr("id", "LinkLine")
                .classed("linkLine", true)
                .style("visibility", "hidden");


            //define position function
            var get_position_function = function (response_graph) {
                if (response_graph.hasOwnProperty("attributes") && response_graph["attributes"].hasOwnProperty("positions")) {
                    var positions = response_graph["attributes"]["positions"];
                    return (function (d) {
                        if (positions.hasOwnProperty(d.id)) {
                            return [positions[d.id]["x"], positions[d.id]["y"]]
                        }
                        else { return null }
                    })
                }
                else {
                    return (function (d) { return null })
                }
            };

            var positionOf = get_position_function(response);

            //set nodes position if known
            var unknownNum = 0;
            node_g.each(function (d) {
                pos = positionOf(d);
                if (pos != null) {
                    d.x = pos[0];
                    d.y = pos[1];
                    d.fx = pos[0];
                    d.fy = pos[1];
                }
                else { unknownNum++ }
            });
            //add symbol
            node_g.append("path")
                .classed("nodeSymbol", true)
                .attr("d", d3.symbol()
                    .type(shapeClassifier.shape)
                    .size(shapeClassifier.size))
                .style("fill", shapeClassifier.nodeColor)
                .on("dblclick", callDetails);


            function callDetails(clicked_node) {
                // Find if that node was already clicked for details. If it wasn't,
                // mark it as clicked. If it was, mark is as not clicked.
                svg.selectAll(".nodeSymbol").filter((nod) => nod.id === clicked_node.id)
                    .classed("detailclicked", function (d) {
                        return !(d3.select(this).classed("detailclicked"));
                    })
                if (svg.selectAll(".detailclicked").empty()) {
                    svg.selectAll(".contact").style("visibility", "visible");
                    svg.selectAll(".gene").selectAll(".nodeSymbol").attr("d", d3.symbol().size(120000));
                    d3.selectAll(".gene").selectAll(".nodeLabel").attr("font-size", function () { return (radius*3) + "px" })
                }
                else {
                    svg.selectAll(".contact").style("visibility", "hidden");
                    svg.selectAll(".gene").selectAll(".nodeSymbol").attr("d", d3.symbol().size(6000));
                    d3.selectAll(".gene").selectAll(".nodeLabel").attr("font-size", function () { return (radius / 2) + "px" })
                }
                // Find the subgraphs of all the detailclicked nodes.
                to_show = [];
                svg.selectAll(".detailclicked").each(function (nod) {
                    tmp_nodes = config.highlightRel(nod.id);
                    for (i = 0; i < tmp_nodes.length; i++) {
                        if (!to_show.includes(tmp_nodes[i])) {
                            to_show.push(tmp_nodes[i])
                        }
                    }
                });
                addDetails((n2_id) => to_show.indexOf(n2_id) > -1);
            }

            // .style("fill", function (d) {
            // 	if (d.type && d.type != "") return "#" + setColor(type_list.indexOf(d.type), type_list.length);
            // 	else return "#EEEEEE";
            // });

            //  node_g.style("WebkitFilter","grayscale(100%)");
            //  node_g.style("-webkit-filter","grayscale(100%)");
            //  node_g.style("filter","grayscale(100%)");

            //add all node id as label
            node_g.insert("text")
                .classed("nodeLabel", true)
                .attr("x", 0)
                .attr("dy", ".3em")
                .attr("text-anchor", "middle")
                .text(function (d) {
                    let name = d.id.split(" ")[0]
                    //return name.length > 6 ? name.substring(0, 6).concat(".") : name;
                    return name.length > 7 ? name.substring(0, 7) : name;
                })
                .attr("font-size", function () { return (radius / 2) + "px" })
                // .style("fill", function (d) {
                // 	if (d.type && d.type != "") return "#" + setColor(type_list.indexOf(d.type), type_list.length, true);
                // 	else return "black";
                // })
                // .style("stroke", function (d) {
                // 	if (d.type && d.type != "") return "#" + setColor(type_list.indexOf(d.type), type_list.length, true);
                // 	else return "black";
                // })
                .on("dblclick", callDetails);

            node_g.filter(d => d.attrs && "val" in d.attrs)
                .insert("text")
                .classed("nodeLabel", true)
                .attr("x", 0)
                .attr("dy", "1.3em")
                .attr("text-anchor", "middle")
                .text(d => {
                    const setString = setToString(d.attrs["val"]);
                    if (setString.length > 7) {
                        return setString.substring(0, 5).concat("..");
                    }
                    else {
                        return setString;
                    }
                })
                //.text(function(d){return d.id})
                .attr("font-size", function () { return (radius / 2) + "px" })
            // .style("fill", function (d) {
            // 	if (d.type && d.type != "") return "#" + setColor(type_list.indexOf(d.type), type_list.length, true);
            // 	else return "black";
            // })
            // .style("stroke", function (d) {
            // 	if (d.type && d.type != "") return "#" + setColor(type_list.indexOf(d.type), type_list.length, true);
            // 	else return "black";
            // })

            node.exit().remove();


            //start the simulation
            //simulation.nodes([]);
            simulation.nodes(response.nodes);

            simulation.alpha(0.01 * unknownNum);
            simulation.alphaDecay(0.1);
            simulation.on("end", function () {
                simulation.on("tick", move(shapeClassifier));
                if (!config.noTranslate) {
                    var rep = getBounds();
                    simulation.alphaDecay(0.02);
                    if (rep) {
						var margin = 80;
                        var xratio = svg.attr("width") / (rep[0][1] - rep[0][0] + 2*margin);
                        var yratio = svg.attr("height") / (rep[1][1] - rep[1][0] + 2*margin);
                        var xorigine = rep[0][0] - margin
                        var yorigine = rep[1][0] - margin
                        var ratio = Math.min(xratio, yratio);
                        //rate = Math.max(rate, 0.02);
                        //rate = Math.min(1.1, rate);
                        //rate = rate * 0.9;
                        var centerX = (svg.attr("width") - (rep[0][1] - rep[0][0] + 2*margin) * ratio) / 2;
                        var centerY = (svg.attr("height") - (rep[1][1] - rep[1][0] + 2*margin) * ratio) / 2;
                        svg.call(zoom.transform, transform.translate(-xorigine * ratio + centerX, -yorigine * ratio + centerY).scale(ratio));
                        svg_content.selectAll("g.node")
                            .attr("vx", 0)
                            .attr("vy", 0);

                    }
                    else {
                        svg.call(zoom.scaleTo, 1);
                    }
                }
                move(shapeClassifier)();
                simulation.on("end", function () {
                    svg_content.selectAll("g.node")
                        .attr("vx", 0)
                        .attr("vy", 0);
                });
            });
            if (path == "/kami_base/kami/action_graph") {
                showDetails();
            }
            simulation.restart();
            // console.log("sim",simulation.force("link"));
            // console.log("sim",simulation.force("center"));
            // console.log("sim",simulation.force("charge"));
            // console.log("sim",simulation.force("chargeAgent"));
            // console.log("sim",simulation.force("chargeBnd"));
            // console.log("sim",simulation.force("chargeBrk"));
        };

        function getBounds() {
            var minx, maxx, miny, maxy;
            svg_content.selectAll("g.node")
                .each(function (d, i) {
                    if (i == 0) {
                        minx = d.x;
                        maxx = d.x;
                        miny = d.y;
                        maxy = d.y;
                        return 0;
                    }
                    if (d.x < minx) { minx = d.x };
                    if (d.x > maxx) { maxx = d.x };
                    if (d.y < miny) { miny = d.y };
                    if (d.y > maxy) { maxy = d.y };
                });
            if (minx) { return [[minx, maxx], [miny, maxy]] }
            else { return undefined };
        };
        /* define a color set according to the size of an array
         * and the element position in the array
         * @input : nb : the element index
         * @input : tot : the size of the array
         * @input : neg : return the color as negative
         * @return : a color in hex format
         */
        function setColor(nb, tot, neg) {
            if (neg) {
                // //calculate color luminosity
                // var tmp = ((0x777777/tot)*(nb+1)).toString(16).split(".")[0];
                // var ret =(parseInt(tmp[0]+tmp[1],16)*299+parseInt(tmp[2]+tmp[3],16)*587+parseInt(tmp[4]+tmp[5],16)*114)/1000;
                // //if brigth : return black, else return white
                // // if(ret <150) return (0xDDDDDD).toString(16);
                // // else return (0x000000).toString(16);

                //return (0x0b0b0b).toString(16);
                // return (0x282828).toString(16);
                return (0x252525).toString(16);


            }
            var red = 136 + (33 / tot) * (nb + 1);
            var blue = (150000 - red * 886) / 114;
            var reds = red.toString(16).split(".")[0];
            while (reds.length < 2) { reds = "0" + reds; };
            var blues = blue.toString(16).split(".")[0];
            while (blues.length < 2) { blues = "0" + blues; };
            return (reds + reds + blues);

            // var ret = ((0x777777/tot)*(nb+1)).toString(16).split(".")[0]
            //while(ret.length<6){ret="0"+ret;};
            // return ret;
        }
        /* define the svg context menu
         * svg context menu allow to unlock all nodes,
         * select all nodes,
         * unselect all nodes,
         * add a new node of a correct type,
         * remove all selected nodes
         * @return : the svg context menu object
         * @call : graphUpdate
         */
        function svgMenu() {
            var menu = [{
                title: "Unlock all",
                action: function (elm, d, i) {
                    svg_content.selectAll("g").each(function (d) { d.fx = null; d.fy = null });
                    if (simulation.nodes().length > 0)
                        simulation.alpha(1).restart();
                    request.rmAttr(g_id, JSON.stringify(["positions"]), function () { });
                }
            }, {
                title: "Lock all",
                action: function (elm, d, i) {

                    var req = {};
                    svg_content.selectAll("g").each(function (d) {
                        d.fx = d.x;
                        d.fy = d.y;
                        req[d.id] = { "x": d.x, "y": d.y }
                    });
                    request.addAttr(g_id, JSON.stringify({ positions: req }), function () { });
                }
            }, {
                title: "Select all",
                action: function (elm, d, i) {
                    svg_content.selectAll("g").classed("selected", true);
                    svg_content.selectAll("g").select(".nodeSymbol").classed("selectedSymbol", true);
                    maybeDrawButtons();
                }
            }, {
                title: "Unselect all",
                action: function (elm, d, i) {
                    svg_content.selectAll("g").classed("selected", false);
                    svg_content.selectAll("g").select(".nodeSymbol").classed("selectedSymbol", false);
                    hideButtons();
                }
            }, {
                title: "Anatomizer",
                action: anatomizerHandler
            }];
            if (!readOnly) {
                menu.push({
                    title: "Add node",
                    action: function (elm, d, i) {
                        var mousepos = d3.mouse(elm);
                        var svgmousepos = d3.mouse(svg_content.node());
                        locked = true;
                        //inputMenu("New Name", [""], type_list.concat(["notype"]), null, true, true, 'center',
                        inputMenu("New Name", [""], type_list, null, true, true, 'center',
                            function (cb) {
                                locked = false;
                                if (cb.line) {
                                    request.addNode(g_id, cb.line, cb.radio, function (e, r) {
                                        if (e) console.error(e);
                                        else {
                                            //console.log("node added")
                                            let req = {};
                                            req[cb.line] = { "x": svgmousepos[0], "y": svgmousepos[1] }
                                            request.addAttr(g_id, JSON.stringify({ positions: req }),
                                                function () {
                                                    if (cb.radio == "state") {
                                                        let label_line = cb.line[0];
                                                        let space_index = label_line.indexOf(" ");
                                                        if (space_index == -1) {
                                                            var state_label = label_line;
                                                        }
                                                        else {
                                                            var state_label = label_line.substring(0, space_index);
                                                        }
                                                        if (state_label == "phos") {
                                                            var state_name = "phosphorylation";
                                                        }
                                                        else {
                                                            var state_name = state_label;
                                                        }
                                                        request.addNodeAtt(g_id, cb.line, JSON.stringify({
                                                            "name": [state_name], "test": ['true']}), function () {
                                                                disp.call("graphUpdate", this, g_id, true);
                                                            });
                                                    }
                                                    else {
                                                        disp.call("graphUpdate", this, g_id, true);
                                                    }
                                                });

                                        }
                                    });
                                }
                            },
                            { x: mousepos[0], y: mousepos[1], r: radius / 2 },
                            svg)
                    }
                });
            };
            var selected = svg_content.selectAll("g.selected")
            if (!readOnly && selected.size()) {
                menu.push({
                    title: "Remove Selected nodes",
                    action: deleteSelectedNodes
                });

                menu.push({
                    title: "Copy",
                    action: function (_elm, _d, _i) {
                        let node_ids = selected.data().map(d => d.id);
                        copyNodes(node_ids);
                    }
                });
            }
            if (nodeClipboard["path"] !== null && nodeClipboard["nodes"] !== []) {
                // if (g_id === nodeClipboard["path"] ||
                //     nodeClipboard["path"] == g_id.substring(0, g_id.lastIndexOf("/"))) {
                menu.push({
                    title: "Paste",
                    action: pasteNode
                });

                // }
            }

            return menu;
        };
        /* define the node context menu
         * node context menu allow to remove it,
         * clone it,
         * link it to all selected nodes,
         * merge with a selected node : TODO -> change server properties,
         * @return : the node context menu object
         * @call : graphUpdate
         */

        function nodeCtMenu(nodeType, from_config) {
            var menu = [
            {
               title: "Change label",
               action: function (elm, d, i) {
                   var lab = [d.id];
                   //locked = true;
                   inputMenu("", lab, null, null, true, true, 'bot', function (cb) {
                       if (cb.line && cb.line != d.id) {
                           request.renameNode(g_id, d.id, cb.line, function (err, ret) {
                               let req = {};
                               req[cb.line] = { "x": d.x, "y": d.y }
                               //locked = false;
                               request.addAttr(g_id, JSON.stringify({ positions: req }),
                                   function () {
                                       disp.call("graphUpdate", this, g_id, true);
                                   });
                           });
                       }
                       //else { locked = false; }
                   }, d, svg_content);
                },
            },

            {
                title: "Clone",
                action: function (elm, d, i) {

                    //let svgmousepos = d3.mouse(svg_content.node());
                    console.log(elm, d, i);
                    locked = true;
                    inputMenu("New Name", [d.id + "copy"], null, null, true, true, 'center', function (cb) {
                        if (cb.line) {
                            request.cloneNode(g_id, d.id, cb.line, function (e, r) {
                                if (e) console.error(e);
                                else {
                                    let req = {};
                                    //req[cb.line] = { "x": svgmousepos[0] + 10, "y": svgmousepos[1] }
                                    req[cb.line] = { "x": d.x + 70, "y": d.y + 70 }
                                    request.addAttr(g_id, JSON.stringify({ positions: req }),
                                        function () { disp.call("graphUpdate", this, g_id, true); });
                                }
                            });
                        }
                        locked = false;
                    }, d, svg_content)
                }
            },

            {
                title: "Delete",
                action: function (elm, d, i) {
                    if (confirm("Are you sure you want to delete this Node ?")) {
                        request.rmNode(g_id, d.id, true, function (e, r) {
                            if (e) console.error(e);
                            else {
                                disp.call("graphUpdate", this, g_id, true);
                                console.log(r);
                            }
                        });
                    }
                }
            },

            // {title: "children",
            //  action: getChildren},

            {
                title: "Add attribute",
                action: function (elm, d, i) {
                    inputMenu("attribute : value", [null, null], null, null, true, true, 'bot', function (cb) {
                        const attribute = cb.line[0]
                        const value = cb.line[1]
                        var callback = function (err, resp) {
                            if (err) {
                                alert(err.currentTarget.response);
                                return false;
                            }
                            disp.call("graphUpdate", this, g_id, true);
                        };
                        request.addNodeAtt(g_id, d.id, JSON.stringify({ [attribute]: [value] }), callback);
                    }, d, svg_content);
                },
            },

            {
                title: "Remove attribute",
                action: function (elm, d, i) {
                    inputMenu("attribute : value", [null, null], null, null, true, true, 'bot', function (cb) {
                        const attribute = cb.line[0]
                        const value = cb.line[1]
                        var callback = function (err, resp) {
                            if (err) {
                                alert(err.currentTarget.response);
                                return false;
                            }
                            disp.call("graphUpdate", this, g_id, true);
                        };
                        request.rmNodeAtt(g_id, d.id, JSON.stringify({ [attribute]: [value] }), callback);
                    }, d, svg_content);
                },
            },

            {
                title: "Types",
                action: nodeTypesEditor
            },

            ];

            var selected = svg_content.selectAll("g.selected")
            if (selected.size()) {
                menu.push({
                    title: "Link to",
                    action: function (elm, d, i) {
                        hideButtons();
                        var cpt = 0, err_cpt = 0;
                        selected.each(function (el) {
                            request.addEdge(g_id, d.id, el.id, function (e, r) {
                                if (!e) { console.log(r); cpt++; }
                                else { console.error(e); err_cpt++; }
                                if (cpt == selected.size() - err_cpt) disp.call("graphUpdate", this, g_id, true);
                            });
                        });

                    }
                });
                if (selected.size() == 1) {
                    menu.push({
                        title: "Merge with selected nodes",
                        action: function (elm, d, i) {
                            locked = true;
                            //var svgmousepos = d3.mouse(svg_content.node());
                            inputMenu("New Name", [d.id + selected.datum().id], null, null, true, true, 'center', function (cb) {
                                if (cb.line) {
                                    hideButtons();
                                    request.mergeNode(g_id, d.id, selected.datum().id, cb.line, true, function (e, r) {
                                        if (!e) {
                                            let req = {};
                                            //req[r] = { "x": svgmousepos[0] + 10, "y": svgmousepos[1] }
                                            req[r] = { "x": ( d.x + selected.datum().x )/2, "y": ( d.y + selected.datum().y )/2 }
                                            request.addAttr(g_id, JSON.stringify({ positions: req }),
                                                function () { disp.call("graphUpdate", this, g_id, true); });
                                            console.log(r);
                                        }
                                        else console.error(e);
                                    });
                                } locked = false;
                            }, d, svg_content);
                        }
                    })
                }
            }
            if (from_config !== undefined && nodeType === "half-act") {
                return menu.concat(from_config);
            }
            else {
                return menu;

            }
        };
        /* define the edge context menu
         * edge context menu allow to remove it,
         * select source and target node,
         * @call : graphUpdate
         */
        var edgeCtMenu = [{
            title: "Select Source-target",
            action: function (elm, d, _i) {
                svg_content.selectAll("g")
                    .filter(function (e) { return e.id == d.source.id || e.id == d.target.id })
                    .classed("selected", true);
                drawButtons();
            }
        }, {
            title: "Remove",
            action: function (elm, d, _i) {
                locked = true;
                if (confirm('Are you sure you want to delete this Edge ? The linked element wont be removed')) {
                    request.rmEdge(g_id, d.source.id, d.target.id, false, function (e, r) {
                        if (e) console.error(e);
                        else {
                            disp.call("graphUpdate", this, g_id, true);
                            console.log(r);
                        }
                        locked = false;
                    });
                } else locked = false;
            }
        }];
        /* handling mouse over nodes
         * show all the node information in the bottom left tooltip
         * @input : d : the node datas
         */
        function numSetToString(set) {
            for (const setType of Object.keys(set)) {
                if (setType === "pos_list") {
                    return set[setType].join(",");
                }
                if (setType === "neg_list") {
                    if (set[setType].length !== 0) {
                        return "D* \\ {" + set[setType].join(",") + "}";
                    }
                    else {
                        return "D*"
                    }
                }
                if (setType === "string") {
                    return set[setType];
                }
                return ""
            }
        }

        function strSetToString(set) {
            for (const setType of Object.keys(set)) {
                if (setType === "pos_list") {
                    return set[setType].join(",");
                }
                if (setType === "neg_list") {
                    if (set[setType].length !== 0) {
                        return "S* \\ {" + set[setType].join(",") + "}";
                    }
                    else {
                        return "S*"
                    }
                }
                return ""
            }
        }

        function setToString(set) {
            const strset = strSetToString(set["strSet"]);
            const numset = numSetToString(set["numSet"])
            if (strset === "") { return numset }
            if (numset === "") { return strset }
            const str = numset + " + " + strset;
            return str === "D* + S*" ? "*" : str;
        }

        function mouseOver(d) {
            var div_ct = "<p><h3><b><center>" + d.id + "</center></b>";
            div_ct += "<h5><b><center>class : " + d.type + "</center></b></h5>";
            if (d.attrs) {
                div_ct += "<ul>";
                for (let el of Object.keys(d.attrs)) {
                    let setString = setToString(d.attrs[el])
                    if (setString) {
                        div_ct += "<li><b><center>" + el + " : " + setString + "</center></b></li>";
                    }
                }
                div_ct += "</ul>";
            }
            div_ct += "</p>";
            d3.select("#n_tooltip")
                .style("visibility", "visible")
                // .style("background-color", "#fffeec")
                // .style("position", "absolute")
                // .style("bottom", "20px")
                // .style("left", "10px")
                // .style("border", "4px solid #0f71ba")
                // .style("border-radius", "10px")
                // .style("box-shadow", " 3px 3px 3px #888888")
                // .style("z-index", " 100")
                // .style("display", " block")
                // .style("text-align", " left")
                // .style("vertical-align", " top")
                // .style("width", " 150px")
                // .style("overflow ", " hidden")
                .html(div_ct);
        };
        /* handling mouse out of nodes
         * hide the bottom left tooltip
         * @input : d : the node datas (not needed yet)
         */
        function mouseOut(d) {
            d3.select("#n_tooltip")
                .style("visibility", "hidden")
                .text("");
        };
        /* handling click on a node
         * on shift : select/uselect the node
         * on ctrl : unlock the node and restart simulation
         * @input : d : the node datas
         */
        function clickHandler(d) {
            d3.event.stopPropagation();
            if (d3.event.ctrlKey) {
                d.fx = null;
                d.fy = null;
                if (simulation.nodes().length > 0)
                    simulation.alpha(1).restart();
                request.rmAttr(g_id, JSON.stringify(["positions", d.id]), function () { });
            }
            if (d3.event.shiftKey) {
                if (d3.select(this).classed("selected")) {
                    d3.select(this).classed("selected", false);
                    d3.select(this).select(".nodeSymbol").classed("selectedSymbol", false);
                    maybeDrawButtons();
                }
                else {
                    d3.select(this).classed("selected", true);
                    d3.select(this).select(".nodeSymbol").classed("selectedSymbol", true);
                    drawButtons();
                }
            }
        };
        /* handling double-click on a node text
         * open an input menu
         * change the node id 
         * @input : d : the node datas
         * @call : graphUpdate
         */
        //function clickText(d) {
        //    let svgmousepos = d3.mouse(svg_content.node());
        //    var el = d3.select(this);
        //    var lab = [d.id];
        //    locked = true;
        //    inputMenu("name", lab, null, null, true, true, 'center', function (cb) {
        //        if (cb.line && cb.line != d.id) {
        //            request.renameNode(g_id, d.id, cb.line, function (err, ret) {
        //                let req = {};
        //                req[cb.line] = { "x": svgmousepos[0] + 10, "y": svgmousepos[1] }
        //                locked = false;
        //                request.addAttr(g_id, JSON.stringify({ positions: req }),
        //                    function () {
        //                        disp.call("graphUpdate", this, g_id, true);
        //                    });
        //            });
        //        }
        //        else { locked = false; }
        //    }, d, svg_content);

        //    // request.cloneNode(g_id, d.id, cb.line, function (err, ret) {
        //    // 	if (!err) {
        //    // 		request.rmNode(g_id, d.id, false, function (e, r) {
        //    // 			if (e) console.error(e);
        //    // 			else {
        //    // 				let req = {};
        //    // 				req[cb.line] = { "x": svgmousepos[0]+10, "y": svgmousepos[1] }
        //    // 				request.addAttr(g_id, JSON.stringify({ positions: req }),
        //    // 					function () { disp.call("graphUpdate", this, g_id, true); });
        //    // 			}
        //    // 		})
        //    // 	}
        //    // 	else console.error(err);
        //    // });

        //};
        /* handling dragging event on nodes
         * @input : d : the node datas
         */
        function dragged(d) {
            if (locked) return;
            var xpos = d3.event.x;
            var ypos = d3.event.y;
            if (d3.event.sourceEvent.buttons == 1) {
                if (simulation.alpha() < 0.09 && simulation.nodes().length > 0)
                    simulation.alpha(1).restart();
                // var xpos = d3.event.x;
                // var ypos = d3.event.y;
                var tx = xpos - saveX;
                var ty = ypos - saveY;
                d3.select(this).attr("cx", d.fx = xpos).attr("cy", d.fy = ypos);
                svg_content.selectAll("g.selected")
                    .filter(function (d2) { return d2.id != d.id })
                    .each(function (d2) {
                        d2.x = d2.x + tx;
                        d2.y = d2.y + ty;
                        d2.fx = d2.x;
                        d2.fy = d2.y;
                        d3.select(this)
                            .attr("cx", d2.fx)
                            .attr("cy", d2.fy)
                    });
                saveX = xpos;
                saveY = ypos;
            }
            else if (d3.event.sourceEvent.buttons == 2 && !readOnly) {
                var mousepos = d3.mouse(svg_content.node());
                svg_content.selectAll("#LinkLine")
                    .attr("x2", beginMouseX + (mousepos[0] - beginMouseX) * 0.99)
                    .attr("y2", beginMouseY + (mousepos[1] - beginMouseY) * 0.99);
            }
        }

        /* handling dragend event on nodes
         * @input : d : the node datas
         */
        function dragNodeEndHighlightRel(config, path) {
            return function (d, _elm, _i) {
                var nodecontext = this;
                var currentEvent = d3.event;
                var xpos = d3.event.x;
                var ypos = d3.event.y;
                //console.log(d3.event.sourceEvent.button);
                if (!d3.event.sourceEvent.button) {
                    var id = d["id"];
                    var req = {};
                    req[id] = { "x": xpos, "y": ypos };
                    //request.addAttr(g_id, JSON.stringify({positions:req}),function(){});
                    svg_content.selectAll("g.selected")
                        .each(function (d) {
                            d.fx = d.x;
                            d.fy = d.y;
                            req[d.id] = { "x": d.x, "y": d.y }
                        });
                    if (!readOnly) {
                        request.addAttr(g_id, JSON.stringify({ positions: req }), function () { });
                    }

                    if (Math.abs(xpos - beginX) > 3 || Math.abs(ypos - beginY) > 3) {
                        svg_content.selectAll("g.selected")
                            .classed("selected", false);
                        hideButtons();
                    }
                }
                else if (d3.event.sourceEvent.button != 0) {
                    svg_content.selectAll("#LinkLine")
                        .style("visibility", "hidden")
                    var targetElement = d3.select(d3.event.sourceEvent.path[1]);
                    if (targetElement.classed("node")) {
                        targetElement.each(function (d2) {
                            if (d2.id !== d.id && d3.event.sourceEvent.button == 2 && !readOnly) {
                                if (!d3.event.sourceEvent.shiftKey) {
                                    //console.log("edges", edgesList);
                                    if (!existsEdge(d.id, d2.id)) {
                                        request.addEdge(g_id, d.id, d2.id, function (e, r) {
                                            if (!e) {
                                                // Temporary fix to indicate which gene nodes belong too
                                                // when a user build a new interaction graphically.
                                                // This should be removed once KAMIStudio properly makes
                                                // use of KAMI.
                                                let in_kami = path.search("/kami_base/kami/");
                                                let in_ag = path.search("action_graph");
                                                let is_action = (d2.type == "bnd" || d2.type == "mod")
                                                if (in_kami == 0 && in_ag == -1 && is_action == false) {
                                                    let new_name = d.id+" "+d2.id
                                                    request.renameNode(g_id, d.id, new_name, function (err, ret) {
                                                        let req = {};
                                                        req[new_name] = { "x": d.x, "y": d.y }
                                                        request.addAttr(g_id, JSON.stringify({ positions: req }),
                                                            function () {
                                                                disp.call("graphUpdate", this, g_id, true);
                                                            });
                                                    });
                                                }
                                                else {
                                                    disp.call("graphUpdate", this, g_id, true)
                                                }
                                            }
                                            else { console.error(e) }
                                        });
                                    }
                                    else {
                                        request.rmEdge(g_id, d.id, d2.id, true, function (e, r) {
                                            if (!e) {
                                                // Counterpart of the temporary fix above.
                                                // Remove from the node label the gene that the node
                                                // belongs to when removing the edge
                                                let in_kami = path.search("/kami_base/kami/");
                                                let in_ag = path.search("action_graph");
                                                let is_action = (d2.type == "bnd" || d2.type == "mod")
                                                let space_index = d.id.indexOf(" ")
                                                if (in_kami == 0 && in_ag == -1 && space_index != -1 && is_action == false) {
                                                    // For the new name, simple cut before the first space.
                                                    var new_name = d.id.substring(0, space_index)
                                                    request.renameNode(g_id, d.id, new_name, function (err, ret) {
                                                        let req = {};
                                                        req[new_name] = { "x": d.x, "y": d.y }
                                                        request.addAttr(g_id, JSON.stringify({ positions: req }),
                                                            function () {
                                                                disp.call("graphUpdate", this, g_id, true);
                                                            });
                                                    });
                                                }
                                                else {
                                                    disp.call("graphUpdate", this, g_id, true)
                                                }
                                            }
                                            else { console.error(e) }
                                        });
                                    }
                                }
                                else {
                                    if (config.shiftLeftDragEndHandler) {
                                        config.shiftLeftDragEndHandler(g_id, d, d2);
                                    }
                                }
                            }
                            else if (d2.id == d.id && d3.event.sourceEvent.button == 2 && !readOnly) {
                                var handler = d3ContextMenu(function () { return nodeCtMenu(d2.type, config["nodeCtMenu"]) })
                                d3.customEvent(currentEvent.sourceEvent, handler, nodecontext, [d, null]);
                            }
                            else if (d2.id == d.id && d3.event.sourceEvent.button == 1) {
                                if (config.highlightRel) {
                                    if (d3.event.sourceEvent.shiftKey) {
                                        let high_nodes = config.highlightRel(d.id);
                                        highlightSubNodes(((n2_id) => high_nodes.indexOf(n2_id) > -1), d.id);
                                        getChildren(d, true);
                                    }
                                    else {
                                        let high_nodes = config.highlightRel(d.id);
                                        highlightNodes(((n2_id) => high_nodes.indexOf(n2_id) > -1), d.id);
                                        getChildren(d, false);
                                    }
                                }
                            }
                        });
                    }
                }
            };
        }

        function dragNodeStart(d) {
            saveX = d3.event.x;
            saveY = d3.event.y;
            beginX = d3.event.x;
            beginY = d3.event.y;
            if (d3.event.sourceEvent.button == 2 && !readOnly) {
                let mousepos = d3.mouse(svg_content.node());
                beginMouseX = mousepos[0];
                beginMouseY = mousepos[1];
                svg_content.selectAll("#LinkLine")
                    .attr("x1", beginMouseX)
                    .attr("y1", beginMouseY)
                    .attr("x2", beginMouseX)
                    .attr("y2", beginMouseY)
                    .style("visibility", "visible");
                startOfLinkNode = d.id;
            }
        }

        this.dragged = dragged;
        this.dragNodeEnd = dragNodeEndHighlightRel({});
        this.dragNodeStart = dragNodeStart;

        function nodeContextMenuHandler(_d) {
            d3.event.stopPropagation();
            d3.event.preventDefault();
            // d3.select(this)
            // 	.on("mouseup", function () { console.log("mouseout") });

        };

        //function addVal(elm, d, _i) {
        //    var val = prompt("Enter a value", "");
        //    if (!val) { return 0 }
        //    var callback = function (err, resp) {
        //        if (err) {
        //            alert(err.currentTarget.response);
        //            return false;
        //        }
        //        // if (!d.attrs) { d.attrs = {} };
        //        // if (!d.attrs["val"]) { d.attrs["val"] = [] };
        //        // const index = d.attrs["val"].indexOf(val);
        //        // if (index === -1) { d.attrs["val"].push(val) };
        //        disp.call("graphUpdate", this, g_id, true);
        //    }
        //    request.addNodeAtt(g_id, d.id, JSON.stringify({ "val": [val] }), callback);
        //};

        //function rmVal(elm, d, i) {
        //    var val = prompt("Enter a value", "");
        //    if (!val) { return 0 };
        //    var callback = function (err, resp) {
        //        if (err) {
        //            alert(err.currentTarget.response);
        //            return false;
        //        }
        //        if (!d.attrs) { return 0 };
        //        if (!d.attrs["val"]) { return 0 };
        //        // let index = d.attrs["val"].indexOf(val);
        //        // if (index != -1) { d.attrs["val"].splice(index, 1) };
        //        disp.call("graphUpdate", this, g_id, true);
        //    }
        //    request.rmNodeAtt(g_id, d.id, JSON.stringify({ "val": [val] }), callback);
        //};

        function nodeTypesEditor(_elm, d, _i) {
            disp.call("loadTypeEditor", this, g_id, d.id)
        };

        function getChildren(d, keepOldConds) {
            var callback = function (err, rep) {
                if (err) {
                    alert(err.currentTarget.response);
                    return false;
                }
                const jsonRep = JSON.parse(rep.response);
                const children = jsonRep["children"];
                // Access user selection options.
                // Type Do or Is
                var desired_type = "none";
                if (d3.select("#do_chkbx").property("checked")) {
                    desired_type = "do"
                }
                if (d3.select("#is_chkbx").property("checked")) {
                    desired_type = "be"
                }
                // Test True or False
                var desired_test = "none";
                if (d3.select("#true_chkbx").property("checked")) {
                    desired_test = "true";
                }
                if (d3.select("#false_chkbx").property("checked")) {
                    desired_test = "false";
                }
                // This is the only way I (Seb) found to access the hierarchy
                // from inside that function. Damn you Javascript.
                factory.getGraphAndDirectChildren(
                    "/kami_base/kami/action_graph",
                    function (err, ret) {
                        if (!err) {
                            let hie = ret
                            // Get the list of nuggets involved with the
                            // clicked node from variable children.
                            var nuggets_tmp = hie["children"]
                                .filter((graph) =>
                                    children.includes(graph["name"]))
                            // Nugget selection based on the type
                            // (do, is) of the clicked node.
                            if (desired_type != "none") {
                                // Nuggets where the clicked node has no
                                // type should be included by default.
                                var nuggets_typeless = nuggets_tmp
                                    .filter((graph) =>
                                        graph.top_graph.nodes.find((n) =>
                                            n["type"] == d.id).attrs
                                            .type == undefined);
                                // Nuggets with the desired type.
                                var nuggets_with_type = nuggets_tmp
                                    .filter((graph) =>
                                        graph.top_graph.nodes.find((n) =>
                                            n["type"] == d.id).attrs
                                            .type != undefined);
                                var nuggets_right_type = nuggets_with_type
                                    .filter((graph) =>
                                        graph.top_graph.nodes.find((n) =>
                                            n["type"] == d.id).attrs.type
                                            .strSet.pos_list == desired_type);
                                var nuggets_type_sel = nuggets_right_type
                                    .concat(nuggets_typeless);
                            } else {
                                var nuggets_type_sel = nuggets_tmp;
                            }
                            // Nugget selection based on the test
                            // (true, false) of the clicked node.
                            if (desired_test != "none") {
                                // Nuggets where the clicked node has no
                                // test should be included by default.
                                var nuggets_testless = nuggets_type_sel
                                    .filter((graph) =>
                                        graph.top_graph.nodes.find((n) =>
                                            n["type"] == d.id).attrs
                                            .test == undefined);
                                // Nuggets with the desired test.
                                 var nuggets_with_test = nuggets_type_sel
                                    .filter((graph) =>
                                        graph.top_graph.nodes.find((n) =>
                                            n["type"] == d.id).attrs
                                            .test != undefined);
                                var nuggets_right_test = nuggets_with_test
                                    .filter((graph) =>
                                        graph.top_graph.nodes.find((n) =>
                                            n["type"] == d.id).attrs.test
                                            .strSet.pos_list == desired_test);
                                var nuggets_test_sel = nuggets_right_test
                                    .concat(nuggets_testless);
                            } else {
                                var nuggets_test_sel = nuggets_type_sel;
                            }
                            var children_sel = nuggets_test_sel.map((n) =>
                                n["name"]);
                            disp.call("addNugetsToInput", this, children_sel,
                                d.id, keepOldConds);
                        }
                    });
                //disp.call("addNugetsToInput", this, children, d.id, keepOldConds);
            }
            request.getChildren(g_id, d.id, callback)
        };

        function selectionHandler() {
            var mousepos = d3.mouse(svg_content.node());
            svg_content.selectAll("#selectionRect")
                .each(function (d) {
                    d3.select(this)
                        .attr("width", Math.abs(mousepos[0] - d.startx))
                        .attr("height", Math.abs(mousepos[1] - d.starty))
                        .attr("x", Math.min(mousepos[0], d.startx))
                        .attr("y", Math.min(mousepos[1], d.starty))
                })

        };
        function selectionHandlerStart() {
            var selectionStart = d3.mouse(svg_content.node());
            svg_content.selectAll("#selectionRect")
                .style("visibility", "visible")
                .each(function (d) {
                    d.startx = selectionStart[0];
                    d.starty = selectionStart[1];
                });
        };
        function selectionHandlerEnd() {
            var mousepos = d3.mouse(svg_content.node());
            svg_content.selectAll("#selectionRect")
                .style("visibility", "hidden")
                .each(function (d) {
                    var minx = Math.min(mousepos[0], d.startx);
                    var maxx = Math.max(mousepos[0], d.startx);
                    var miny = Math.min(mousepos[1], d.starty);
                    var maxy = Math.max(mousepos[1], d.starty);
                    svg_content.selectAll("g")
                        .filter(function (n) {
                            return (
                                n.x <= maxx &&
                                n.x >= minx &&
                                n.y <= maxy &&
                                n.y >= miny);
                        })
                        .classed("selected", true);
                    svg_content.selectAll("g")
                        .filter(function (n) {
                            return (
                                n.x <= maxx &&
                                n.x >= minx &&
                                n.y <= maxy &&
                                n.y >= miny);
                        })
                        .select(".nodeSymbol")
                        .classed("selectedSymbol", true);
                    maybeDrawButtons();
                });
        }

        function svgClickHandler() {
            svg_content.selectAll("g.selected")
                .classed("selected", false);
            svg_content.selectAll(".nodeSymbol")
                .classed("selectedSymbol", false);
            hideButtons();
            dehilightNodes();
        }
        this.svg_result = function () { return (svg.node()); };

        function showDetails() {
            if (d3.select("#detail_chkbx").property("checked") == true) {
                d3.selectAll(".contact").style("visibility", "hidden")
                d3.selectAll(".region").style("visibility", "visible")
                d3.selectAll(".site").style("visibility", "visible")
                d3.selectAll(".residue").style("visibility", "visible")
                d3.selectAll(".state").style("visibility", "visible")
                d3.selectAll(".mod").style("visibility", "visible")
                d3.selectAll(".bnd").style("visibility", "visible")
                d3.selectAll(".link").style("visibility", "visible")
                d3.selectAll(".gene").selectAll(".nodeSymbol").attr("d", d3.symbol().size(6000))
                d3.selectAll(".gene").selectAll(".nodeLabel").attr("font-size", function () { return (radius / 2) + "px" })
            } else {
                d3.selectAll(".contact").style("visibility", "visible")
                d3.selectAll(".region").style("visibility", "hidden")
                d3.selectAll(".site").style("visibility", "hidden")
                d3.selectAll(".residue").style("visibility", "hidden")
                d3.selectAll(".state").style("visibility", "hidden")
                d3.selectAll(".mod").style("visibility", "hidden")
                d3.selectAll(".bnd").style("visibility", "hidden")
                d3.selectAll(".link").style("visibility", "hidden")
                d3.selectAll(".gene").selectAll(".nodeSymbol").attr("d", d3.symbol().size(120000));
                d3.selectAll(".gene").selectAll(".nodeLabel").attr("font-size", function () { return (radius*3) + "px" })
            }
        }

        function dehilightNodes() {
            svg.selectAll(".nodeSymbol").classed("highlighted", false);
	    svg.selectAll(".node").classed("lowlighted", false);
	    svg.selectAll(".link").classed("highlighted", false);
            svg.selectAll(".link").classed("lowlighted", false);
            if (svg.selectAll(".detailclicked").empty()) {
                svg.selectAll(".contact").style("visibility", "visible");
            }
        }

        function highlightNodes(to_highlight, clicked_id) {
            svg.selectAll(".nodeSymbol").classed("highlighted", function (d) {
                return to_highlight(d.id)
            });
            svg.selectAll(".node").classed("lowlighted", function (d) {
                return !to_highlight(d.id)
            });
            svg.selectAll(".link").classed("highlighted", function (d) {
                return to_highlight(d.source.id) && to_highlight(d.target.id)
            });
            svg.selectAll(".link").classed("lowlighted", function (d) {
                return !to_highlight(d.source.id) || !to_highlight(d.target.id)
            });
            // Gather the ids of the that that their details shown. We should not
            // show contacts for these nodes.
            var detailed_nodes = [];
            svg.selectAll(".detailclicked").each(function (d) { detailed_nodes.push(d.id) })
            svg.selectAll(".contact").style("visibility", function (d) {
                if (!(clicked_id == d.source.id) && !(clicked_id == d.target.id)) {
                    return "hidden";
                }
                else {
                    if (detailed_nodes.includes(d.source.id) || detailed_nodes.includes(d.target.id)) {
                        return "hidden";
                    }
                    else {
                        return "visible";
                    }
                }
            });
        }

        // Only highlights node among the already highlighted.
	// That function is bugged at the moment. Don't use it for now.
        function highlightSubNodes(to_highlight, clicked_id) {
            svg.selectAll(".nodeSymbol").classed("highlighted", function (d) {
                return (d3.select(this).classed("highlighted")) && to_highlight(d.id)
            });
            svg.selectAll(".node").classed("lowlighted", function (d) {
                return (d3.select(this).classed("lowlighted")) || !to_highlight(d.id)
            });
            svg.selectAll(".link").classed("highlighted", function (d) {
                return (d3.select(this).classed("highlighted")) && to_highlight(d.source.id) && to_highlight(d.target.id)
            });
            svg.selectAll(".link").classed("lowlighted", function (d) {
                return (d3.select(this).classed("lowlighted")) || !to_highlight(d.source.id) || !to_highlight(d.target.id)
            });
            svg.selectAll(".contact").style("visibility", function (d) {
                //return (d3.select(this).classed("lowlighted")) || (!(clicked_id == d.source.id) && !(clicked_id == d.target.id))
                if ((d3.select(this).style("visibility") == "hidden") || (!(clicked_id == d.source.id) && !(clicked_id == d.target.id))) {
                    return "hidden";
                }
                else {
                    return "visible";
                }
            });
        }

        // Taken from the GitHubGist of Sundar Singh "SVG to the front and back".
        d3.selection.prototype.moveToBack = function() {
            return this.each(function() {
                var firstChild = this.parentNode.firstChild;
                if (firstChild) {
                    this.parentNode.insertBefore(this, firstChild);
                }
            });
        };

        function addDetails(to_show) {
            // Show the details around all the nodes
            svg.selectAll(".node").style("visibility", function (d) {
                if (to_show(d.id) == true) {return "visible"};
                if (to_show(d.id) == false && d.type != "gene") {return "hidden"};
            });
            //svg.selectAll(".link").style("visibility", function (d) {
            //    if (to_show(d.source.id) == true && to_show(d.target.id) == true) {return "visible"}
            //    else {return "hidden"};
            //});
            var links_to_draw = ag_links.filter((d) => (to_show(d.source.id) == true && to_show(d.target.id) == true));
            var link = svg_content.selectAll(".link")
                    .data(links_to_draw, function (d) { return d.source.id + "-" + d.target.id; });
            link.enter().append("path").classed("link", true)
                    .on("contextmenu", d3ContextMenu(edgeCtMenu));
            d3.selectAll(".link").moveToBack();
            simulation.restart();
            link.exit().remove();
            // Hide all the contacts that involve the clicked gene.
            //svg.selectAll(".contact").style("visibility", function (d) {
            //    if (to_show(d.source.id) == true && to_show(d.target.id) == true) {return "hidden"}
            //    else {return "visible"};
            //});
        }

        function newChild() {
            var selected = svg_content.selectAll("g.selected")
            let node_ids = selected.data().map(d => d.id);
            disp.call("addGraphIGraph", this, g_id, node_ids);

        }
        function newGraph(_elm, _d, _i) {
            var selected = svg_content.selectAll("g.selected")
            let val = prompt("New name:", "");
            if (!val) { return 0 }
            let node_ids = selected.data().map(d => d.id);
            let callback = function (err, _ret) {
                if (err) { console.error(err) }
                else {
                    disp.call("hieUpdate", this);
                }
            };
            request.newGraphFromNodes(g_id, val, node_ids, callback);
        }

        function newChildRule(_elm, _d, _i) {
            var selected = svg_content.selectAll("g.selected")
            let val = prompt("New name:", "");
            if (!val) { return 0 }
            let node_ids = selected.data().map(d => d.id);
            let callback = function (err, _ret) {
                if (err) { console.error(err) }
                else {
                    disp.call("hieUpdate", this);
                }
            };
            request.newChildRuleFromNodes(g_id, val, node_ids, callback);
        }

        function maybeDrawButtons() {
            var selected = svg_content.selectAll("g.selected")
            if (selected.size()) {
                drawButtons();
            }
            else {
                hideButtons();
            }
        }

        function drawButtons() {
            d3.select(buttonsDiv)
                .style("display", "block");
        }

        function hideButtons() {
            d3.select(buttonsDiv)
                .style("display", "none");
        }

        function createButtons() {
            if (!readOnly) {
                let buttons = d3.select(buttonsDiv);
                buttons.attr("id", "GraphButtons")
                    // .append("button")
                    // .text("New child graph")
                    // .on("click", newGraph);
                    .append("button")
                    .text("New nugget")
                    .on("click", newChild);

                // buttons .append("button")
                // 	.text("New sigbling graph")
                // 	.on("click", function () { alert("sibling graph") });

                // buttons.append("button")
                // 	.text("New child rule")
                // 	.on("click", newChildRule);

                // buttons.append("button")
                // 	.text("New sibling rule")
                // 	.on("click", function () { alert("sibling rule") });

                buttons.selectAll("button")
                    .attr("type", "button")
                    .classed("top_chart_elem", true)
                    .classed("btn", true)
                    .classed("btn-block", true);
                buttons.style("display", "none");
                return buttons.node();
            }
        }

        function deleteSelectedNodes(elm, d, i) {
            var selected = svg_content.selectAll("g.selected");
            if (!readOnly && selected.size()) {
                if (confirm("Delete all selected Nodes ?")) {
                    hideButtons();
                    selected.each(function (el, i) {
                        request.rmNode(g_id, el.id, true, function (e, r) {
                            if (e) console.error(e);
                            else console.log(r);
                            if (i === selected.size() - 1) disp.call("graphUpdate", this, g_id, true);
                        })
                    });
                }
            }
        }

        this.buttons = function () { return buttonsDiv; };

        function copyNodes(nodeIds) {
            nodeClipboard["path"] = g_id;
            nodeClipboard["nodes"] = nodeIds;
        }

        function pasteNode(_elm, _d, _i, svgmousepos) {
            if (svgmousepos === undefined) {
                svgmousepos = d3.mouse(svg_content.node());
            }
            let callback = function (_e, _r) {
                disp.call("graphUpdate", this, g_id, true);
            };
            request.pasteNodes(g_id, nodeClipboard["path"], nodeClipboard["nodes"], svgmousepos, callback);
        }

        function svgKeydownHandler(path) {
            if (d3.event.target === d3.select("body").node()) {
                if (d3.event.keyCode === 80 || (d3.event.keyCode === 86 && d3.event.ctrlKey)) {
                    if (nodeClipboard["path"] !== null && nodeClipboard["nodes"] !== []) {
                        let transf = d3.zoomTransform(svg.node());
                        pasteNode(null, null, null, [(-transf.x + width / 2) / transf.k, (-transf.y + height / 2) / transf.k]);
                    }

                }
                else if (d3.event.keyCode === 89 || (d3.event.keyCode === 67 && d3.event.ctrlKey)) {
                    var selected = svg_content.selectAll("g.selected")
                    if (selected.size()) {
                        let node_ids = selected.data().map(d => d.id);
                        copyNodes(node_ids);
                    }
                }
                else if (d3.event.keyCode === 46) {
                    deleteSelectedNodes();
                }
                else if (String.fromCharCode(d3.event.keyCode) === "N" && !readOnly) {
                    console.log("beforevisible");
                    d3.select("#" + newNodeId).style("visibility", "visible");
                    d3.select("body").on("keydown", newNodeSelect.input);
                    svg.on("click", newNodeClickHandler);
                }
                // Keyboard shortcuts to select node type and test.
                // 'd' to toggle Do type (keyCode 68)
                // 'i' to toggle Is type (keyCode 73)
                // 't' to toggle True test (keyCode 84)
                // 'f' to toggle False test (keyCode 70)
                // 's' to toggle Details (keyCode 83)
                // Transfered here from TopMenu.js because, somehow, it stops
                // working after clicking on the left panel when the code is
                // left in TopMenu.js.
                else if (d3.event.keyCode === 68) {
                    chk_state = d3.select("#do_chkbx").property("checked");
                    if (chk_state == false) {
                        d3.select("#do_chkbx").property("checked", true);
                        d3.select("#is_chkbx").property("checked", false);
                    } 
                    if (chk_state == true) {
                        d3.select("#do_chkbx").property("checked", false);
                    }
                }
                else if (d3.event.keyCode === 66) {
                    chk_state = d3.select("#is_chkbx").property("checked");
                    if (chk_state == false) {
                        d3.select("#is_chkbx").property("checked", true);
                        d3.select("#do_chkbx").property("checked", false);
                    } if (chk_state == true) {
                        d3.select("#is_chkbx").property("checked", false);
                    }
                }
                else if (d3.event.keyCode === 84) {
                    chk_state = d3.select("#true_chkbx").property("checked");
                    if (chk_state == false) {
                        d3.select("#true_chkbx").property("checked", true);
                        d3.select("#false_chkbx").property("checked", false);
                    } if (chk_state == true) {
                        d3.select("#true_chkbx").property("checked", false);
                    }
                }
                else if (d3.event.keyCode === 70) {
                    chk_state = d3.select("#false_chkbx").property("checked");
                    if (chk_state == false) {
                        d3.select("#false_chkbx").property("checked", true);
                        d3.select("#true_chkbx").property("checked", false);
                    } if (chk_state == true) {
                        d3.select("#false_chkbx").property("checked", false);
                    }
                }
                else if (d3.event.keyCode === 83) {
                    // Show/Hide details is supposed to work only
                    // in the action graph.
                    if (path == "/kami_base/kami/action_graph") {
                        chk_state = d3.select("#detail_chkbx").property("checked");
                        if (chk_state == false) {
                            d3.select("#detail_chkbx").property("checked", true);
                        } if (chk_state == true) {
                            d3.select("#detail_chkbx").property("checked", false);
                        }
                        showDetails();
                    }
                }
                else if (d3.event.keyCode === 67 && !d3.event.ctrlKey) {
                    // Clear all details when pressing c. This shortcut still
                    // has no equivalent clickble icon.
                    // It is like a secret button...
                    svg.selectAll(".nodeSymbol").classed("detailclicked", false);
                    showDetails();
                } 
            }
        }
        this.svgKeydownHandler = svgKeydownHandler;

        function newNodeClickHandler() {
            let currentType = newNodeSelect.currentType();
            if (currentType) {
                let svgmousepos = d3.mouse(svg_content.node());
                let callback = function (e, _r) {
                    if (e) console.error(e);
                    else { disp.call("graphUpdate", this, g_id, true); }
                }
                request.addNodeNewName(g_id, currentType, currentType, svgmousepos, callback);
            }
        }

        this.endNewNode = function () {
            console.log("endNewNode")
            d3.select("body").on("keydown", svgKeydownHandler);
            svg.on("click", svgClickHandler);
        }

        function anatomizerHandler() {
            let uniProtId = prompt("enter UniProt accession or HGNC symbol", "");
            if (!uniProtId) { return false }

            let callback = function (e, _r) {
                if (e) { console.log(e) }
                else {
                    console.log("graphUpdate");
                    disp.call("graphUpdate", this, g_id, true);
                }
            };
            request.anatomizer(g_id, uniProtId, callback);

        }

    };
});
