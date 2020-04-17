git-explorer
============

> view all DAG nodes in the .git/objects folder

Purpose
-------
When we run `git log ...` we only see the commits.  But if we open the `.git` folder and cruise through the `objects` folder, we see much more content in there.  This tool allows you to view all the DAG nodes and visualize their relationships and content.


How to Use
----------

1. Specify the git repo to examine: Inside the `src` folder, create an `env.json` file that looks like this:

   ```
   {
     "gitRepo": "/path/to/your/repo"
   }
   ```

   Note that this is to the root repo folder, the one with the .git folder inside it, not the .git folder itself.

2. `npm install` or `yarn install`

3. `npm start`

4. Browse to http://localhost:3000/

   By default, it shows all the commits in a big blob. Click on the buttons above to arrange the nodes or show more features.

   Click on a dot on the left to show the content of that DAG node on the right.


License
-------

License: MIT, Copyright Richardson & Sons, LLC
