"""Root server app."""
import os

from flask import Flask, url_for
from flask.ext.session import Session
from flask_bootstrap import Bootstrap

from kamistudio.home.views import home_blueprint
from kamistudio.model.views import model_blueprint
from kamistudio.action_graph.views import action_graph_blueprint
from kamistudio.nuggets.views import nuggets_blueprint

from kami import Model


class KAMIStudio(Flask):
    """Flask server for KAMIStudio."""

    def __init__(self, name, template_folder):
        """Initialize a KAMIStudio application object."""
        super().__init__(name)


# App initialization
app = KAMIStudio(__name__,
                 template_folder="./kamistudio/templates")
Bootstrap(app)

# Session config
app.secret_key = b'_5#y2L"H9R8z\n\xec]/'
app.config['SESSION_TYPE'] = 'filesystem'
Session(app)

# Configure the KAMIStudio server
app.config.from_pyfile('instance/configs.py')
app.models = {
    "Test model": Model()
}
app.new_nugget = None
app.new_nugget_type = None

# register the blueprints
app.register_blueprint(home_blueprint)
app.register_blueprint(model_blueprint)
app.register_blueprint(action_graph_blueprint)
app.register_blueprint(nuggets_blueprint)


@app.context_processor
def override_url_for():
    """Override url_for function with dated url."""
    return dict(url_for=dated_url_for)


def dated_url_for(endpoint, **values):
    """Add a time stamp to an url."""
    if endpoint == 'static':
        filename = values.get('filename', None)
        if filename:
            file_path = os.path.join(app.root_path,
                                     endpoint, filename)
            values['q'] = int(os.stat(file_path).st_mtime)
    return url_for(endpoint, **values)

if __name__ == "__main__":
    app.run(host='0.0.0.0')
