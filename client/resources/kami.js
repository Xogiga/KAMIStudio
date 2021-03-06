define([
    "resources/kamiRequestFactory.js",
    "resources/requestFactory.js",
    "resources/IGraphUtils.js"

], function (kamiFactory, requestFactory, iGraphUtils) {
    return function Kami(dispatch, url, request) {
        var kamiRequest = new kamiFactory(url);
        var factory = new requestFactory(url)
        var graphUtils = new iGraphUtils(dispatch, factory);
        var request = new requestFactory(url);

        /*
        creates loci, bnd and brk nodes if shift is pressed when linking two components
        callback updates the graph if operation is successful
        */
        this.shiftLeftDragEndHandler = function (g_id, d1, d2) {
            let components = new Set(["gene", "region", "site"])
            if (components.has(d1.type) && components.has(d2.type)) {
                let callback = function (err, _ret) {
                    if (!err) {
                        dispatch.call("graphUpdate", this, g_id, true)
                    }
                };
                kamiRequest.linkComponents(g_id, d1.id, d2.id, function() {
                    // Add type and test attributes to the bnd node.
                    let bnd_node = "bnd "+d1.id+"-"+d2.id
                    request.addNodeAtt(g_id, bnd_node, JSON.stringify({
                        "type": { "strSet": { "pos_list": ["do"] } },
                        "test": { "strSet": { "pos_list": ["true"] } } }), callback);
                });
            }
        };

        this.kamiAncestors = function (path) {
            var path2 = path.split("/");
            path2 = path2.slice(3);
            var degree = path2.length;
            return factory.promAncestors(path, degree);
        };

        // this.kamiTypes = {
        //     "nugget": {
        //         type: "nugget"
        //     },
        //     "rule": {
        //         type: "rule"
        //     },
        //     "variant_graph": {
        //         type: "variant_graph"
        //     },
        //     "variant_rule": {
        //         type: "variant_rule"
        //     }
        // };

        this.nodeCtMenu = function (path) {
            const unfold = function (_elm, d, _i) {
                const callback = function (err, _ret) {
                    if (err) { console.error(err) }
                    else {
                        dispatch.call("graphUpdate", this, path, true);
                    }
                };
                kamiRequest.unfoldLocus(path, d.id, callback);
            }

            const removeConflict = function (_elm, d, _i) {
                const callback = function (err, _ret) {
                    if (err) { console.error(err) }
                    else {
                        dispatch.call("graphUpdate", this, path, true);
                    }
                };
                kamiRequest.removeConflict(path, d.id, callback);
            }
            return [{
                title: "unfold",
                action: unfold
            },
            {
                title: "remove_conflict",
                action: removeConflict
            }
            ];

        };

    }
});
