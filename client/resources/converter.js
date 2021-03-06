/* This module contain convertion functions for graph structures
 * this module trigger graphFileLoaded events
 * @ Author Adrien Basso blandin
 * This module is part of regraphGui project
 * this project is under AGPL Licence
*/
define(["resources/d3/d3.js"],function(d3){ return {
/* converte a snip file into a regraph file
 * @input : json_file : a snip Json File
 * @input : dispatch : the dispatch event object
 * @input : type : the graph type
 * @output : a Regraph Json File
*/ 
snipToRegraph:function(json_file,dispatch,type){
	d3.json(json_file,function(response){
		var ret={
			"name":"ThreadGraph",
			"top_graph":{"edges":[],"nodes":[]},
			"children":[]
		};
		ret.top_graph.nodes.push({id:"Concat",type:""});
		ret.top_graph.nodes.push({id:"Contact",type:""});
		ret.top_graph.nodes.push({id:"LastName",type:""});
		ret.top_graph.nodes.push({id:"FirstName",type:""});
		ret.top_graph.edges.push({from:"LastName",to:"Contact"});
		ret.top_graph.edges.push({from:"FirstName",to:"Contact"});
		ret.top_graph.edges.push({from:"LastName",to:"Concat"});
		ret.top_graph.edges.push({from:"FirstName",to:"Concat"});
		response.forEach(function(el,el_idx){
			ret.top_graph.nodes.push({id:el.name+"_Thread",type:""});
			ret.top_graph.edges.push({from:"Contact",to:el.name+"_Thread"});
			ret.top_graph.edges.push({from:"Concat",to:el.name+"_Thread"});
			var n_child={
				"name":el.name,
				"top_graph":{"edges":[],"nodes":[]},
				"children":[]
			};
			el.contacts.forEach(function(e,idx){
				n_child.top_graph.nodes.push({id:e.id,type:"Contact"});
				if(e.lastName!=""){
					n_child.top_graph.nodes.push({id:e.lastName+"_"+idx,type:"LastName"});
					n_child.top_graph.edges.push({from:e.lastName+"_"+idx,to:e.id});
				}if(e.firstName!=""){
					n_child.top_graph.nodes.push({id:e.firstName+"_"+idx,type:"FirstName"});
					n_child.top_graph.edges.push({from:e.firstName+"_"+idx,to:e.id});
				}
			});
			el.threads.forEach(function(e,idx){
				if(e.length>0){
					n_child.top_graph.nodes.push({id:"cvt_"+idx,type:el.name+"_Thread"});
					e.forEach(function(node){
						n_child.top_graph.edges.push({from:node,to:"cvt_"+idx});
					});
				}
			});
			ret.children.push(n_child);
		});
		console.log(ret);
		return dispatch.call(
			"graphFileLoaded",
			this,
			{"hierarchy":ret,"coord":{},"type":type}
		);
	});
},
/* convert the old Kami 2.0 graph format to the new Regraph Format
 * Convert a nugget list into a graph tree with the action graph as root and each action as nugget leafs
 * @input : json_file : a Kami 2.0 Json File
 * @input : dispatch : the dispatch event object
 * @input : type : the graph type
 * @output : a Regraph Json File
*/ 
kamiToRegraph:function(json_file,dispatch,type){
	d3.json(json_file,function(response){
		if(!response.version){
			dispatch.call("graphFileLoaded",this,{"hierarchy":response,"coord":null,"type":type});
			return;
		}else{
			var ret = 
			{	"name":"ActionGraph",
				"top_graph":{
					"edges":[],
					"nodes":[]
				},
				"children":[],
				"rules":[]
			};
			var class_to_section =
			{	"agent":"agents",
				"region":"regions",
				"key_res":"key_rs",
				"attribute":"attributes",
				"flag":"flags",
				"action":"actions"
			};
			var converted_name = {
				"agent":"agent",
				"region":"region",
				"key_res":"residue",
				"attribute":null,
				"flag":"state",
				"bnd":"bnd",
				"brk":"brk",
				"syn":"syn",
				"deg":"deg",
				"mod":"mod"
			};
			var coord = {};
			//add simple nodes
			["agents","regions","key_rs","flags"].forEach(function(e){
				response[e].forEach(function(el,i){
					var ass_attr = response.attributes.filter(function(at,ii){
						return getFth(at) == el.path.join("_")+"_"+el.labels.join("_")+"_"+i;
					});
					var attr = el.values.length>0?{"val":el.values}:{};
					ass_attr.forEach(function(ass){attr[ass.labels.join("_")]=ass.values});
					ret.top_graph.nodes.push(
					{	
						"id":el.path.join("_")+"_"+el.labels.join("_")+"_"+i,
						"type":converted_name[el.classes[0]],
						"input_constraints":[],
						"output_constraints":[],
						"attrs":attr
					});
					if(el.father_classes.length>0){
						ret.top_graph.edges.push(
						{
							"from":el.path.join("_")+"_"+el.labels.join("_")+"_"+i,
							"to":getFth(el)
						});
					}
					if(el.x){
						coord[el.path.join("_")+"_"+el.labels.join("_")+"_"+i]={"x":el.x,"y":el.y}
					}
				});
			});
			//add actions
			response.actions.forEach(function(el,i){
				var ass_attr = response.attributes.filter(function(at,ii){
						return getFth(at) == "_"+el.labels.join("_")+"_"+i;
				});
				var attr = {};
				//add action in action graph
				ass_attr.forEach(function(ass){attr[ass.labels.join("_")]=ass.values});
				ret.top_graph.nodes.push(
				{	
					"id":"_"+el.labels.join("_")+"_"+i,
					"type":converted_name[el.classes[1]],
					"input_constraints":[],
					"output_constraints":[],
					"attrs":attr
				});
				if(el.x){
					coord["_"+el.labels.join("_")+"_"+i]={"x":el.x,"y":el.y}
				}
				var nugget =
				{	"name":"_"+el.labels.join("_")+"_"+i,
					"top_graph":{
						"edges":[],
						"nodes":[]
					},
					"children":[],
					"rules":[]
				};
				nugget.top_graph.nodes.push(
				{	
					"id":"_"+el.labels.join("_")+"_"+i,
					"type":"_"+el.labels.join("_")+"_"+i,
					"input_constraints":[],
					"output_constraints":[],
					"attrs":attr
				});
				//add left, rigth and ctx
				var cpt =0;//count elements in nuggets
				["left","right","context"].forEach(function(act_c){
					if(act_c!="context" &&(converted_name[el.classes[1]]=="bnd" || converted_name[el.classes[1]]=="brk")){
						ret.top_graph.nodes.push(
						{	
							"id":"_"+el.labels.join("_")+"_"+i+"_"+act_c,
							"type":"locus",
							"input_constraints":[],
							"output_constraints":[],
						});
						ret.top_graph.edges.push(
						{
							"from":"_"+el.labels.join("_")+"_"+i+"_"+act_c,
							"to":"_"+el.labels.join("_")+"_"+i
						});
						nugget.top_graph.nodes.push(
						{	
							"id":"_"+el.labels.join("_")+"_"+i+"_"+act_c,
							"type":"_"+el.labels.join("_")+"_"+i+"_"+act_c,
							"input_constraints":[],
							"output_constraints":[],
						});
						nugget.top_graph.edges.push(
						{
							"from":"_"+el.labels.join("_")+"_"+i+"_"+act_c,
							"to":"_"+el.labels.join("_")+"_"+i
						});
					}
					el[act_c].forEach(function(act_el){
						nugget.top_graph.nodes.push(
						{	
							"id":response[act_el.ref[0]][act_el.ref[1]].path.join("_")+"_"+response[act_el.ref[0]][act_el.ref[1]].labels.join("_")+"_"+act_el.ref[1]+"_"+cpt,
							"type":response[act_el.ref[0]][act_el.ref[1]].path.join("_")+"_"+response[act_el.ref[0]][act_el.ref[1]].labels.join("_")+"_"+act_el.ref[1],
							"input_constraints":[],
							"output_constraints":[],
							"attrs":act_el.values?{"val":act_el.values}:{}
						})
						if(act_c!="context"){
							var the_end="";
							if(converted_name[el.classes[1]]=="bnd" || converted_name[el.classes[1]]=="brk")the_end="_"+act_c;
							nugget.top_graph.edges.push(
							{
								"from":"_"+el.labels.join("_")+"_"+i+the_end,
								"to":response[act_el.ref[0]][act_el.ref[1]].path.join("_")+"_"+response[act_el.ref[0]][act_el.ref[1]].labels.join("_")+"_"+act_el.ref[1]+"_"+cpt
							});
							ret.top_graph.edges.push(
							{
								"from":"_"+el.labels.join("_")+"_"+i+the_end,
								"to":response[act_el.ref[0]][act_el.ref[1]].path.join("_")+"_"+response[act_el.ref[0]][act_el.ref[1]].labels.join("_")+"_"+act_el.ref[1]
							});
						}
					});
					cpt++;
				});
				ret.children.push(nugget);
			});
			/* return the father of an element,
			 * @input elmt : the element of the kami json file
			 * @output : the id of its father in the new regraph format
			 */
			function getFth(elmt){
				var idx=-1;
				var resp = response[class_to_section[elmt.father_classes[0]]].filter(function(el,i){
					if(("path" in el ? el.path.join("_") : "")+(el.path.length>0?"_":"")+el.labels[0] == elmt.path.join("_")){
						idx=i;
						return true;
					}
					return false;
				});
				if(resp.length!=1) throw new Error("Error while finding father of "+elmt.path.join("_")+"_"+elmt.labels[0])
				return resp[0].path.join("_")+"_"+resp[0].labels.join("_")+"_"+idx;
			};
			
			dispatch.call("graphFileLoaded",this,{"hierarchy":ret,"coord":coord,"type":type});
		}
	});
},
/* export a given graph into a json file
 * open a new windows with the json file
 *  if there exist coordinate for nodes in the graph, output them in an other file
 * @input : ret : the graph hierarchy object
 * TODO : add coordinate to graph object !
 */
exportGraph:function(ret){
	var url = 'data:text/json;charset=utf8,' + encodeURIComponent(JSON.stringify(ret.hierarchy,null,"\t"));

		window.open(url, '_blank');
		window.focus();
	if(ret.coord){
		var url2 = 'data:text/json;charset=utf8,' + encodeURIComponent(JSON.stringify(ret.coord,null,"\t"));
			window.open(url2, '_blank');
	}
	
},

downloadGraph:function(response){
	d3.select("#json_hierarchy_link")
		.attr("href",
		'data:text/json;charset=utf-8,'
		+ encodeURIComponent(JSON.stringify(response)));
	document.getElementById('json_hierarchy_link').click();
},
/* add cordinates to a graph
 * @input : coord : a coordinate hashtable for each nodes
 * @input : graphic_g : the interactive graph to updateCommands
 * TODO : this function
 */
loadCoord:function(coord,graphic_g){
	console.log("not implemented");
}
}});
