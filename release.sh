git co release
git reset --hard HEAD
git merge master
echo "base-command.whipple.life" > CNAME
git add CNAME
git commit -m "Update release CNAME"
git push --force release release
git co master